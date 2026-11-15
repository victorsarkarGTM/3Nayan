import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import type { StaffRole } from '../_shared/core/index.ts';
import { serviceClientFrom, type Deps } from '../_shared/deps.ts';
import { withHandler, type Handler } from '../_shared/http.ts';
import { FakeSms, FakeWhatsApp } from '../_shared/providers/msg91/fake.ts';
import { FakePush } from '../_shared/providers/push/fake.ts';
import { FakeVerification } from '../_shared/providers/verification/fake.ts';

const env = (k: string) => process.env[k];

export function serviceClient(): SupabaseClient {
  return serviceClientFrom(env);
}

/** Deps wired to the local database with fake providers. `envOverrides` win over process.env. */
export function testDeps(envOverrides: Record<string, string> = {}, over: Partial<Deps> = {}): Deps {
  const e = (k: string) => envOverrides[k] ?? process.env[k];
  return { db: serviceClient(), now: () => new Date(), env: e, sms: new FakeSms(), whatsapp: new FakeWhatsApp(), push: new FakePush(), verification: new FakeVerification(), ...over };
}

function anonClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { userId: string; token: string; client: SupabaseClient };

let counter = 0;
const uniquePhone = () => `9198${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, '0')}`;

/** A phone user (profile auto-created) with an aal1 session. */
export async function createUser(phone = uniquePhone()): Promise<TestUser & { phone: string }> {
  const email = `${phone}@users.3nayan.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    email,
    password,
    phone_confirm: true,
    email_confirm: true,
  });
  if (error) throw error;
  const client = anonClient();
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { userId: data.user.id, token: s.session!.access_token, client, phone: `+${phone}` };
}

/** A staff user with an aal2 (TOTP-verified) session, or aal1 when `mfa` is false. */
export async function createStaff(role: StaffRole, opts: { mfa?: boolean } = {}): Promise<TestUser> {
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@staff.3nayan.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { error: e1 } = await admin.from('staff').insert({ user_id: data.user.id, email, role });
  if (e1) throw e1;
  const client = anonClient();
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  if (opts.mfa === false) return { userId: data.user.id, token: s.session!.access_token, client };
  const { data: enrol, error: e3 } = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (e3) throw e3;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(enrol.totp.secret) });
  const { error: e4 } = await client.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: totp.generate() });
  if (e4) throw e4;
  const { data: s2 } = await client.auth.getSession();
  return { userId: data.user.id, token: s2.session!.access_token, client };
}

/** Call a handler in-process exactly as the deployed function would be called. */
export async function invoke(
  handler: Handler,
  body: unknown,
  opts: { token?: string; deps?: Deps } = {},
): Promise<{ status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } } }> {
  const deps = opts.deps ?? testDeps();
  const res = await withHandler(handler, () => deps)(
    new Request('http://local/fn', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    }),
  );
  return { status: res.status, body: await res.json() };
}

/** A phone user who has started a practitioner application (draft). */
export async function createApplicant(phone?: string): Promise<TestUser & { phone: string; practitionerId: string }> {
  const u = await createUser(phone);
  const { data, error } = await u.client
    .from('practitioners')
    .insert({ user_id: u.userId, display_name: 'Rahul Sharma' })
    .select('id')
    .single();
  if (error) throw error;
  return { ...u, practitionerId: data.id };
}

export async function setPractitionerStatus(practitionerId: string, status: string) {
  const { error } = await serviceClient().from('practitioners').update({ status }).eq('id', practitionerId);
  if (error) throw error;
}
