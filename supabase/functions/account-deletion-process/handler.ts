import { AppError, accountDeletionProcessSchema } from '../_shared/core/index.ts';
import { audit } from '../_shared/audit.ts';
import { getCaller, requireStaff } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { cancelOpenTrials } from '../_shared/practitioner.ts';

/**
 * Anonymise a user's personal data while keeping records the law requires (KYC results, consents,
 * status history, audit log), then remove their phone login and ban the account.
 */
export async function accountDeletionProcess(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  requireStaff(caller, ['super_admin']);
  const { requestId } = await parseBody(req, accountDeletionProcessSchema);
  const { data: request } = await deps.db.from('deletion_requests').select('*').eq('id', requestId).maybeSingle();
  if (!request) throw new AppError('not_found');
  if (request.status === 'completed') return { status: 'completed', noop: true };
  const userId: string = request.user_id;
  const db = deps.db;
  const now = deps.now().toISOString();

  const { data: avatars } = await db.storage.from('avatars').list(userId);
  if (avatars?.length) await db.storage.from('avatars').remove(avatars.map((f: { name: string }) => `${userId}/${f.name}`));
  await db.from('device_tokens').delete().eq('user_id', userId);
  await db.from('profiles').update({ full_name: 'Deleted user', photo_path: null, phone: null, deleted_at: now }).eq('id', userId);

  const { data: p } = await db.from('practitioners').select('id,video_path').eq('user_id', userId).maybeSingle();
  if (p) {
    await cancelOpenTrials(deps, p.id);
    if (p.video_path) await db.storage.from('practitioner-private').remove([p.video_path]);
    await db
      .from('practitioners')
      .update({ display_name: 'Deleted practitioner', bio: null, links: [], credentials_text: null, video_path: null, photo_path: null })
      .eq('id', p.id);
  }

  const { error: authError } = await db.auth.admin.updateUserById(userId, { phone: '', ban_duration: '876000h' });
  if (authError) throw new Error(`could not disable login: ${authError.message}`);

  await db.from('deletion_requests').update({ status: 'completed', completed_at: now }).eq('id', requestId);
  await db
    .from('attention_items')
    .update({ status: 'resolved', resolved_by: caller.userId, resolved_at: now })
    .eq('kind', 'deletion_requested')
    .eq('target_id', userId)
    .eq('status', 'open');
  await audit(deps, { actorId: caller.userId, actorKind: 'staff', action: 'account.deleted', targetTable: 'profiles', targetId: userId });
  return { status: 'completed', noop: false };
}
