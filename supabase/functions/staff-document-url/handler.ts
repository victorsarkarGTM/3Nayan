import { AppError, SIGNED_URL_TTL_SECONDS, staffDocumentUrlSchema } from '../_shared/core/index.ts';
import { audit } from '../_shared/audit.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 60-second signed URL for a private applicant file; every issued link is audited. */
export async function staffDocumentUrl(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['reviewer', 'support', 'finance', 'super_admin']);
  const { path } = await parseBody(req, staffDocumentUrlSchema);
  const practitionerId = path.split('/')[0] ?? '';
  if (!UUID.test(practitionerId) || path.includes('..')) throw new AppError('not_found');
  const { data: p } = await deps.db.from('practitioners').select('id').eq('id', practitionerId).maybeSingle();
  if (!p) throw new AppError('not_found');
  const { data, error } = await deps.db.storage.from('practitioner-private').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new AppError('not_found');
  await audit(deps, {
    actorId: caller.userId,
    actorKind: 'staff',
    action: 'document.view',
    targetTable: 'practitioners',
    targetId: practitionerId,
    metadata: { path },
  });
  return { url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS };
}
