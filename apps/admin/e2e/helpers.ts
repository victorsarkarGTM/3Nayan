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
