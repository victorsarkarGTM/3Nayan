import { emptySchema } from '../_shared/core/index.ts';
import { getCaller } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';

export async function accountDeletionRequest(req: Request, deps: Deps) {
  const caller = await getCaller(req, deps);
  await parseBody(req, emptySchema);
  const existing = await deps.db
    .from('deletion_requests')
    .select('id')
    .eq('user_id', caller.userId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing.data) return { requestId: existing.data.id };
  const { data, error } = await deps.db
    .from('deletion_requests')
    .insert({ user_id: caller.userId })
    .select('id')
    .single();
  if (error) {
    // Lost a race with a concurrent request: return the pending one.
    const again = await deps.db.from('deletion_requests').select('id').eq('user_id', caller.userId).eq('status', 'pending').single();
    if (again.data) return { requestId: again.data.id };
    throw new Error(error.message);
  }
  await deps.db.from('attention_items').insert({ kind: 'deletion_requested', target_id: caller.userId, metadata: { requestId: data.id } });
  return { requestId: data.id };
}
