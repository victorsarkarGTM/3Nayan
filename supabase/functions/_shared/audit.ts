import type { Deps } from './deps.ts';

export type AuditEntry = {
  actorId: string | null;
  actorKind: 'staff' | 'system' | 'user';
  action: string;
  targetTable?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function audit(deps: Deps, e: AuditEntry): Promise<void> {
  const { error } = await deps.db.rpc('write_audit', {
    p_actor_id: e.actorId,
    p_actor_kind: e.actorKind,
    p_action: e.action,
    p_target_table: e.targetTable ?? null,
    p_target_id: e.targetId ?? null,
    p_metadata: e.metadata ?? {},
  });
  if (error) throw new Error(`audit write failed: ${error.message}`);
}
