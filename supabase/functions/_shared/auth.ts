import { AppError, type StaffRole } from './core/index.ts';
import type { Deps } from './deps.ts';

export type Caller = { userId: string; staffRole: StaffRole | null; aal: 'aal1' | 'aal2' };

function decodeClaims(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) return {};
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  try {
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

/** Resolve the signed-in caller from the Authorization header (token verified by Supabase Auth). */
export async function getCaller(req: Request, deps: Deps): Promise<Caller> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new AppError('unauthenticated');
  const { data, error } = await deps.db.auth.getUser(token);
  if (error || !data.user) throw new AppError('unauthenticated');
  const aal = decodeClaims(token).aal === 'aal2' ? 'aal2' : 'aal1';
  const { data: staff } = await deps.db
    .from('staff')
    .select('role')
    .eq('user_id', data.user.id)
    .eq('active', true)
    .maybeSingle();
  return { userId: data.user.id, staffRole: (staff?.role as StaffRole | undefined) ?? null, aal };
}

/** Throws forbidden unless the caller is active staff in one of `roles` AND signed in with MFA. */
export function requireStaff(caller: Caller, roles: StaffRole[]): asserts caller is Caller & { staffRole: StaffRole } {
  if (!caller.staffRole || !roles.includes(caller.staffRole) || caller.aal !== 'aal2') {
    throw new AppError('forbidden');
  }
}

/** Authorises a service-role-only call (cron jobs, internal fan-out). */
export function requireServiceRole(req: Request, deps: Deps): void {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token !== deps.env('SUPABASE_SERVICE_ROLE_KEY')) throw new AppError('unauthenticated');
}
