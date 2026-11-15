import type { Deps } from '../deps.ts';
import { TEMPLATES, type Channel, type TemplateKey } from './templates.ts';

export type ChannelResult = { channel: Channel; ok: boolean; providerRef?: string; error?: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/**
 * Send one channel of a template. Returns null when the channel has no destination
 * (no phone for SMS/WhatsApp, no device token for push), which is not a failure.
 */
export async function sendChannel(
  deps: Deps,
  userId: string,
  key: TemplateKey,
  channel: Channel,
  data: Record<string, string>,
): Promise<ChannelResult | null> {
  const rendered = TEMPLATES[key].render(data);
  if (channel === 'push') {
    const { data: tokens } = await deps.db.from('device_tokens').select('expo_token').eq('user_id', userId);
    const list = (tokens ?? []).map((t: { expo_token: string }) => t.expo_token);
    if (!list.length) return null;
    try {
      const outcome = await deps.push.send(list, rendered.pushTitle, rendered.pushBody);
      const dead = outcome.filter((o) => o.error === 'DeviceNotRegistered').map((o) => o.token);
      if (dead.length) await deps.db.from('device_tokens').delete().in('expo_token', dead);
      return outcome.some((o) => o.ok)
        ? { channel, ok: true }
        : { channel, ok: false, error: outcome.map((o) => o.error).filter(Boolean).join(', ') || 'push failed' };
    } catch (e) {
      return { channel, ok: false, error: errText(e) };
    }
  }
  const { data: profile } = await deps.db.from('profiles').select('phone').eq('id', userId).maybeSingle();
  const phone: string | null = profile?.phone ?? null;
  if (!phone) return null;
  try {
    const r =
      channel === 'sms'
        ? await deps.sms.sendTemplate(phone, deps.env(`MSG91_TEMPLATE_${key.toUpperCase()}`) ?? key, rendered.vars)
        : await deps.whatsapp.send(phone, key, rendered.vars);
    return { channel, ok: true, providerRef: r.providerRef };
  } catch (e) {
    return { channel, ok: false, error: errText(e) };
  }
}

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
  const results: ChannelResult[] = [];
  for (const channel of TEMPLATES[key].channels) {
    const r = await sendChannel(deps, userId, key, channel, data);
    if (r) results.push(r);
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
