import { Webhook } from 'standardwebhooks';
import type { Deps } from '../_shared/deps.ts';

const MAX_PER_PHONE_PER_HOUR = 5;

const hookError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Supabase Auth "Send SMS" hook: verify signature, enforce per-phone limit, send OTP via MSG91. */
export async function handleSendSms(req: Request, deps: Deps): Promise<Response> {
  const secret = deps.env('SEND_SMS_HOOK_SECRET');
  if (!secret) return hookError(500, 'SMS hook is not configured');
  const body = await req.text();
  let payload: { user: { phone: string }; sms: { otp: string } };
  try {
    payload = new Webhook(secret.replace('v1,whsec_', '')).verify(
      body,
      Object.fromEntries(req.headers.entries()),
    ) as typeof payload;
  } catch {
    return hookError(401, 'Invalid signature');
  }
  const raw = payload.user.phone;
  const phone = raw.startsWith('+') ? raw : `+${raw}`;
  const since = new Date(deps.now().getTime() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await deps.db
    .from('otp_sends')
    .select('*', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', since);
  if (countError) return hookError(500, 'Could not check rate limit');
  if ((count ?? 0) >= MAX_PER_PHONE_PER_HOUR) {
    return hookError(429, 'Too many codes requested for this number. Please wait an hour and try again.');
  }
  const { error: insertError } = await deps.db.from('otp_sends').insert({ phone });
  if (insertError) return hookError(500, 'Could not record OTP send');
  try {
    await deps.sms.sendOtp(phone, payload.sms.otp);
  } catch (err) {
    console.error('sms send failed', err);
    return hookError(500, 'We could not send the code. Please try again in a minute.');
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}
