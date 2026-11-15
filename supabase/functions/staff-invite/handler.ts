import { staffInviteSchema } from '../_shared/core/index.ts';
import { audit } from '../_shared/audit.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';

async function findUserByEmail(deps: Deps, email: string) {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await deps.db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit || data.users.length < 200) return hit ?? null;
  }
  return null;
}

/** Super-admins invite staff by email (idempotent: re-inviting updates the role and reactivates). */
export async function staffInvite(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['super_admin']);
  const { email: raw, role } = await parseBody(req, staffInviteSchema);
  const email = raw.toLowerCase();
  // Invite and password links land on the admin "set your password" page.
  const redirectTo = deps.env('ADMIN_URL') ? `${deps.env('ADMIN_URL')}/auth/accept` : undefined;
  let user = await findUserByEmail(deps, email);
  let emailSent: 'invite' | 'password_link';
  if (!user) {
    const { data, error } = await deps.db.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) throw new Error(error.message);
    user = data.user;
    emailSent = 'invite';
  } else {
    // Existing account (e.g. an expired invite or a returning staff member): send a password link.
    const { error } = await deps.db.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) throw new Error(error.message);
    emailSent = 'password_link';
  }
  const { error } = await deps.db.from('staff').upsert({ user_id: user.id, email, role, active: true });
  if (error) throw new Error(error.message);
  await audit(deps, { actorId: caller.userId, actorKind: 'staff', action: 'staff.invite', targetTable: 'staff', targetId: user.id, metadata: { email, role } });
  return { userId: user.id, emailSent };
}
