import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { localEnv } from './env';

const env = localEnv();
export const admin = () => createClient(env.url, env.service, { auth: { persistSession: false } });

/** Test numbers configured in supabase/config.toml ([auth.sms.test_otp]); OTP is always 123456. */
export const TEST_PHONES = Array.from({ length: 9 }, (_, i) => `91999990000${i + 1}`);

export async function deleteUserByPhone(phone: string) {
  const db = admin();
  for (let page = 1; page < 50; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const hit = data.users.find((u) => u.phone === phone);
    if (hit) {
      await db.auth.admin.deleteUser(hit.id);
      return;
    }
    if (data.users.length < 200) return;
  }
}

export async function userIdByPhone(phone: string): Promise<string> {
  const { data } = await admin().from('profiles').select('id').eq('phone', `+${phone}`).single();
  return data!.id;
}

export async function loginWithPhone(page: Page, typed: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(typed);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify' }).click();
}

export async function completeOnboarding(page: Page, name = 'Asha Rao') {
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel(/I accept the Terms of Use/).check();
  await page.getByLabel(/I accept the Privacy Policy/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}
