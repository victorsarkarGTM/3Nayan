import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import type { Database } from '@3nayan/db';

export type Sb = SupabaseClient<Database>;
const url = () => process.env.SUPABASE_URL!;
export const admin = () =>
  createClient<Database>(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const anon = (fetchImpl?: typeof fetch) =>
  createClient<Database>(url(), process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });

let n = 0;
export async function signedInUser(): Promise<{ sb: Sb; userId: string }> {
  const phone = `9197${String(Date.now()).slice(-6)}${String(n++ % 100).padStart(2, '0')}`;
  const email = `${phone}@users.3nayan.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ phone, email, password, phone_confirm: true, email_confirm: true });
  if (error) throw error;
  const sb = anon();
  await sb.auth.signInWithPassword({ email, password });
  return { sb, userId: data.user.id };
}

export async function signedInStaff(role: 'reviewer' | 'support' | 'finance' | 'super_admin'): Promise<{ sb: Sb; userId: string }> {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@staff.3nayan.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin().from('staff').insert({ user_id: data.user.id, email, role });
  const sb = anon();
  await sb.auth.signInWithPassword({ email, password });
  const { data: f } = await sb.auth.mfa.enroll({ factorType: 'totp' });
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(f!.totp.secret) });
  await sb.auth.mfa.challengeAndVerify({ factorId: f!.id, code: totp.generate() });
  return { sb, userId: data.user.id };
}
