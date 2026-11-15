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

export const fixture = (name: string) => new URL(`./.fixtures/${name}`, import.meta.url).pathname;

export async function signUp(page: Page, phone10: string, name = 'Rahul Sharma') {
  await loginWithPhone(page, phone10);
  await completeOnboarding(page, name);
  await expect(page).toHaveURL(/\/home/);
}

export async function practitionerIdFor(phone12: string): Promise<string> {
  const uid = await userIdByPhone(phone12);
  const { data } = await admin().from('practitioners').select('id').eq('user_id', uid).single();
  return data!.id;
}

/** Steps 1–4 of the application (fills, saves, advances). */
export async function fillSteps1to4(page: Page) {
  await page.goto('/practitioner/apply/1');
  await page.getByLabel('Display name').fill('Rahul Sharma');
  await page.getByLabel('Profile photo').setInputFiles(fixture('photo.png'));
  await expect(page.getByAltText('Your profile photo')).toBeVisible();
  await page.getByLabel('About you').fill('I help people find calm and clarity through Reiki and guided breathwork. '.repeat(2));
  await page.getByLabel('Years of experience').fill('6');
  await page.getByRole('checkbox', { name: 'Reiki' }).check();
  await page.getByRole('checkbox', { name: 'Hindi' }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/apply\/2/);
  await page.getByRole('checkbox', { name: 'Online sessions' }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/apply\/3/);
  await page.getByLabel('Certificates').setInputFiles(fixture('cert.pdf'));
  await expect(page.getByText('cert.pdf')).toBeVisible();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/apply\/4/);
  await page.getByLabel('Introduction video').setInputFiles(fixture('intro-45s.mp4'));
  await expect(page.getByText('Uploaded · 45 seconds')).toBeVisible();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/apply\/5/);
}

export async function fillSteps5and6(page: Page) {
  await page.getByLabel('Email').fill('rahul@example.com');
  await page.getByLabel('Address line 1').fill('12 MG Road');
  await page.getByLabel('City').fill('Pune');
  await page.getByLabel('State').fill('Maharashtra');
  await page.getByLabel('PIN code').fill('411001');
  await page.getByLabel('PAN').fill('ABCDE1234F');
  await page.getByRole('button', { name: 'Verify PAN' }).click();
  await expect(page.getByTestId('kyc-pan')).toContainText('Verified');
  await page.getByRole('button', { name: 'Verify with DigiLocker' }).click();
  await expect(page).toHaveURL(/apply\/5\?kyc=done/);
  await expect(page.getByTestId('kyc-aadhaar')).toContainText('Verified');
  await page.getByLabel('Account number').fill('123456783210');
  await page.getByLabel('IFSC').fill('HDFC0001234');
  await page.getByRole('button', { name: 'Verify bank account' }).click();
  await expect(page.getByTestId('kyc-bank')).toContainText('Verified');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/apply\/6/);
  await page.getByRole('checkbox', { name: /I will not diagnose medical conditions/ }).check();
  await page.getByRole('checkbox', { name: /I accept the Practitioner Agreement/ }).check();
  await page.getByRole('button', { name: 'Save agreement' }).click();
}
