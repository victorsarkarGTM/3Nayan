import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as OTPAuth from 'otpauth';
import { localEnv } from './env';

const env = localEnv();
export const admin = () => createClient(env.url, env.service, { auth: { persistSession: false } });
export const totp = (secret: string) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate();

export type StaffRole = 'reviewer' | 'support' | 'finance' | 'super_admin';

export async function createStaffUser(role: StaffRole | null) {
  const email = `${role ?? 'nobody'}-${crypto.randomUUID().slice(0, 8)}@staff.3nayan.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (role) await admin().from('staff').insert({ user_id: data.user.id, email, role });
  return { email, password, userId: data.user.id };
}

/** Sign in and complete first-time TOTP enrolment; returns the TOTP secret for later logins. */
export async function staffLogin(page: Page, u: { email: string; password: string }): Promise<string> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent())!.replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  return secret;
}

export async function loginAs(page: Page, role: StaffRole) {
  const u = await createStaffUser(role);
  await staffLogin(page, u);
  await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
  return u;
}

/** Seed a complete, submitted application (service role), optionally with a flagged KYC check. */
export async function seedApplication(opts: { flagged?: boolean } = {}) {
  const db = admin();
  const phone = `9196${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const { data: u, error } = await db.auth.admin.createUser({ phone, email: `${phone}@users.3nayan.test`, password: `Pw-${crypto.randomUUID()}`, phone_confirm: true, email_confirm: true });
  if (error) throw error;
  const name = `Applicant ${crypto.randomUUID().slice(0, 6)}`;
  const { data: p } = await db.from('practitioners').insert({
    user_id: u.user.id, display_name: name, photo_path: `${u.user.id}/avatar.png`,
    bio: 'Reiki practitioner helping people find calm and clarity. '.repeat(3), years_experience: 6,
    languages: ['English', 'Hindi'], offers_online: true, city: 'Pune', email: 'applicant@example.com',
    residential_address: { street1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    video_path: `x/video/intro.mp4`, video_duration_seconds: 45, video_bytes: 1000, video_mime: 'video/mp4',
    agreement_version: 'draft-1', declaration_accepted: true,
  }).select('id').single();
  const pid = p!.id as string;
  const { data: cat } = await db.from('categories').select('id').eq('slug', 'reiki').single();
  await db.from('practitioner_categories').insert({ practitioner_id: pid, category_id: cat!.id });
  const certPath = `${pid}/certificate/${crypto.randomUUID()}.pdf`;
  await db.storage.from('practitioner-private').upload(certPath, new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
  await db.from('practitioner_documents').insert({ practitioner_id: pid, kind: 'certificate', storage_path: certPath, file_name: 'reiki-master.pdf', mime_type: 'application/pdf', size_bytes: 8 });
  const { data: checks } = await db.from('verification_checks').insert([
    { practitioner_id: pid, kind: 'pan', status: 'passed', verified_name: 'RAHUL SHARMA', name_match_score: 1 },
    { practitioner_id: pid, kind: 'aadhaar', status: 'passed', verified_name: 'RAHUL SHARMA', masked_ref: 'XXXX XXXX 1234', name_match_score: 1 },
    { practitioner_id: pid, kind: 'bank', status: opts.flagged ? 'flagged' : 'passed', verified_name: opts.flagged ? 'PRIYA NAIR' : 'RAHUL SHARMA', name_match_score: opts.flagged ? 0.4 : 1 },
  ]).select('id,kind');
  const cid = (k: string) => checks!.find((c) => c.kind === k)!.id;
  await db.rpc('store_pan', { p_check_id: cid('pan'), p_pan: 'ABCDE1234F' });
  await db.rpc('store_bank_account', { p_check_id: cid('bank'), p_account: '123456783210', p_ifsc: 'HDFC0001234' });
  await db.from('practitioners').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', pid);
  return { practitionerId: pid, userId: u.user.id, name };
}

/** A datetime-local value (as typed by a reviewer) for `hoursFromNow`, expressed in IST. */
export function istInput(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 3600_000 + 5.5 * 3600_000);
  return d.toISOString().slice(0, 16);
}
