import { AppError } from './core/index.ts';
import type { Deps } from './deps.ts';

export type TrialRow = {
  id: string;
  practitioner_id: string;
  reviewer_id: string;
  proposed_slots: string[];
  proposed_at: string | null;
  scheduled_at: string | null;
  status: 'proposed' | 'scheduled' | 'completed' | 'missed' | 'expired' | 'cancelled';
  hms_room_id: string | null;
  reschedule_used: boolean;
};

export async function loadTrial(deps: Deps, trialId: string): Promise<TrialRow & { practitioner_user_id: string; practitioner_status: string; display_name: string | null }> {
  const { data } = await deps.db
    .from('trial_calls')
    .select('*, practitioners!inner(user_id,status,display_name)')
    .eq('id', trialId)
    .maybeSingle();
  if (!data) throw new AppError('not_found');
  const p = data.practitioners as { user_id: string; status: string; display_name: string | null };
  return { ...(data as TrialRow), practitioner_user_id: p.user_id, practitioner_status: p.status, display_name: p.display_name };
}
