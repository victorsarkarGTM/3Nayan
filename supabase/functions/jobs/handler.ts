import { formatIST, jobsSchema, trialDueActions } from '../_shared/core/index.ts';
import { requireServiceRole } from '../_shared/auth.ts';
import type { Deps } from '../_shared/deps.ts';
import { parseBody } from '../_shared/http.ts';
import { syncLinkedAccounts } from '../_shared/linked-account.ts';
import { notify, sendChannel } from '../_shared/notifications/notify.ts';
import type { Channel, TemplateKey } from '../_shared/notifications/templates.ts';

const MAX_NOTIFICATION_RETRIES = 3;
const MIN = 60_000;

async function trialReminders(deps: Deps) {
  const now = deps.now();
  let pickReminders = 0;
  let expired = 0;
  let hourReminders = 0;

  const { data: proposed } = await deps.db
    .from('trial_calls')
    .select('id,practitioner_id,reviewer_id,proposed_at,pick_reminder_sent, practitioners!inner(user_id,display_name)')
    .eq('status', 'proposed')
    .not('proposed_at', 'is', null);
  for (const t of proposed ?? []) {
    const p = t.practitioners as unknown as { user_id: string; display_name: string | null };
    const due = trialDueActions(new Date(t.proposed_at), now, t.pick_reminder_sent);
    if (due.includes('expire')) {
      const { data: done } = await deps.db
        .from('trial_calls')
        .update({ status: 'expired' })
        .eq('id', t.id)
        .eq('status', 'proposed')
        .select('id');
      if (done?.length) {
        expired++;
        await deps.db.from('attention_items').insert({
          kind: 'trial_expired',
          target_id: t.practitioner_id,
          metadata: { trialId: t.id, reviewerId: t.reviewer_id },
        });
      }
      continue;
    }
    if (due.includes('send_pick_reminder')) {
      // Claim the reminder atomically so overlapping runs never double-send.
      const { data: claimed } = await deps.db
        .from('trial_calls')
        .update({ pick_reminder_sent: true })
        .eq('id', t.id)
        .eq('pick_reminder_sent', false)
        .select('id');
      if (claimed?.length) {
        pickReminders++;
        await notify(deps, p.user_id, 'trial_pick_reminder', { name: p.display_name ?? '' });
      }
    }
  }

  const { data: soon } = await deps.db
    .from('trial_calls')
    .select('id,scheduled_at, practitioners!inner(user_id,display_name)')
    .eq('status', 'scheduled')
    .eq('hour_reminder_sent', false)
    .gte('scheduled_at', new Date(now.getTime() + 55 * MIN).toISOString())
    .lte('scheduled_at', new Date(now.getTime() + 65 * MIN).toISOString());
  for (const t of soon ?? []) {
    const p = t.practitioners as unknown as { user_id: string; display_name: string | null };
    const { data: claimed } = await deps.db
      .from('trial_calls')
      .update({ hour_reminder_sent: true })
      .eq('id', t.id)
      .eq('hour_reminder_sent', false)
      .select('id');
    if (claimed?.length) {
      hourReminders++;
      await notify(deps, p.user_id, 'trial_reminder', {
        name: p.display_name ?? '',
        time: formatIST(new Date(t.scheduled_at)),
      });
    }
  }
  return { pickReminders, expired, hourReminders };
}

async function notificationRetry(deps: Deps) {
  const since = new Date(deps.now().getTime() - 24 * 60 * MIN).toISOString();
  const { data: failed } = await deps.db
    .from('notifications')
    .select('id,user_id,template_key,channel,data,retries')
    .eq('status', 'failed')
    .lt('retries', MAX_NOTIFICATION_RETRIES)
    .gte('created_at', since)
    .limit(200);
  let resent = 0;
  for (const n of failed ?? []) {
    const r = await sendChannel(deps, n.user_id, n.template_key as TemplateKey, n.channel as Channel, n.data ?? {});
    const ok = r?.ok === true;
    if (ok) resent++;
    await deps.db
      .from('notifications')
      .update({
        status: ok ? 'sent' : 'failed',
        retries: n.retries + 1,
        error: ok ? null : (r?.error ?? 'no destination'),
        provider_ref: r?.providerRef ?? null,
      })
      .eq('id', n.id);
  }
  return { attempted: failed?.length ?? 0, resent };
}

/** Cron entrypoint (service role only). */
export async function jobs(req: Request, deps: Deps) {
  requireServiceRole(req, deps);
  const { job } = await parseBody(req, jobsSchema);
  switch (job) {
    case 'trial-reminders':
      return trialReminders(deps);
    case 'razorpay-sync':
      return { updated: await syncLinkedAccounts(deps) };
    case 'notification-retry':
      return notificationRetry(deps);
  }
}
