import type { Deps } from '../deps.ts';
import { TEMPLATES, type Channel, type TemplateKey } from './templates.ts';

type ChannelResult = { channel: Channel; ok: boolean; providerRef?: string; error?: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/**
 * Send a transactional notification on every channel of the template, independently.
 * Each attempted channel is logged in `notifications`; a failing channel never blocks the others.
 */
export async function notify(
  deps: Deps,
  userId: string,
  key: TemplateKey,
  data: Record<string, string>,
): Promise<{ sent: Channel[]; failed: Channel[] }> {
  const template = TEMPLATES[key];
  const rendered = template.render(data);
  const { data: profile } = await deps.db.from('profiles').select('phone').eq('id', userId).maybeSingle();
  const phone: string | null = profile?.phone ?? null;

  const results: ChannelResult[] = [];
  for (const channel of template.channels) {
    if (channel === 'sms') {
      if (!phone) continue;
      try {
        const templateId = deps.env(`MSG91_TEMPLATE_${key.toUpperCase()}`) ?? key;
        const r = await deps.sms.sendTemplate(phone, templateId, rendered.vars);
        results.push({ channel, ok: true, providerRef: r.providerRef });
      } catch (e) {
        results.push({ channel, ok: false, error: errText(e) });
      }
    } else if (channel === 'whatsapp') {
      if (!phone) continue;
      try {
        const r = await deps.whatsapp.send(phone, key, rendered.vars);
        results.push({ channel, ok: true, providerRef: r.providerRef });
      } catch (e) {
        results.push({ channel, ok: false, error: errText(e) });
      }
    } else {
      const { data: tokens } = await deps.db.from('device_tokens').select('expo_token').eq('user_id', userId);
      const list = (tokens ?? []).map((t: { expo_token: string }) => t.expo_token);
      if (!list.length) continue;
      try {
        const outcome = await deps.push.send(list, rendered.pushTitle, rendered.pushBody);
        const dead = outcome.filter((o) => o.error === 'DeviceNotRegistered').map((o) => o.token);
        if (dead.length) await deps.db.from('device_tokens').delete().in('expo_token', dead);
        const anyOk = outcome.some((o) => o.ok);
        results.push(
          anyOk
            ? { channel, ok: true }
            : { channel, ok: false, error: outcome.map((o) => o.error).filter(Boolean).join(', ') || 'push failed' },
        );
      } catch (e) {
        results.push({ channel, ok: false, error: errText(e) });
      }
    }
  }

  if (results.length) {
    const { error } = await deps.db.from('notifications').insert(
      results.map((r) => ({
        user_id: userId,
        template_key: key,
        channel: r.channel,
        status: r.ok ? 'sent' : 'failed',
        data,
        provider_ref: r.providerRef ?? null,
        error: r.error ?? null,
      })),
    );
    if (error) console.error('notification log insert failed', error);
  }
  return {
    sent: results.filter((r) => r.ok).map((r) => r.channel),
    failed: results.filter((r) => !r.ok).map((r) => r.channel),
  };
}
