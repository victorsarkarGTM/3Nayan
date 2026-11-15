import { callFunction, checkMaybe } from './functions.ts';
import type { Sb } from './types.ts';

export async function getMyTrial(sb: Sb) {
  const { data: u } = await sb.auth.getUser();
  const p = checkMaybe(await sb.from('practitioners').select('id').eq('user_id', u.user?.id ?? '').maybeSingle());
  if (!p) return null;
  return checkMaybe(
    await sb
      .from('trial_calls')
      .select('id,status,proposed_slots,scheduled_at,reschedule_used')
      .eq('practitioner_id', p.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

export const selectTrialSlot = (sb: Sb, trialId: string, slotStart: string) =>
  callFunction<{ scheduledAt: string }>(sb, 'trial-select', { trialId, slotStart });
export const requestTrialReschedule = (sb: Sb, trialId: string) =>
  callFunction<{ status: string }>(sb, 'trial-reschedule-request', { trialId });
export const getTrialJoinToken = (sb: Sb, trialId: string) =>
  callFunction<{ token: string; roomId: string; role: 'reviewer' | 'applicant' }>(sb, 'trial-join-token', { trialId });
