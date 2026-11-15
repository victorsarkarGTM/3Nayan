import { expect, test } from '@playwright/test';
import { admin, completeOnboarding, loginWithPhone, userIdByPhone } from './helpers';

test('invalid phone shows inline error and sends no OTP', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible();
  await expect(page.getByLabel('6-digit code')).toHaveCount(0);
});

test("sign up 9999900001 → onboarding → home shows 'Booking opens soon'", async ({ page }) => {
  await loginWithPhone(page, '99999 00001');
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText('Booking opens soon')).toBeVisible();
  await expect(page.getByRole('link', { name: /Become a practitioner/ })).toBeVisible();
});

test('onboarding cannot continue without accepting terms and privacy', async ({ page }) => {
  await loginWithPhone(page, '9999900002');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Full name').fill('Bina');
  await page.getByLabel(/I accept the Terms of Use/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Please accept the Terms of Use and Privacy Policy to continue')).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding/);
});

test('consents stored with current versions', async ({ page }) => {
  await loginWithPhone(page, '+91 99999 00004');
  await completeOnboarding(page, 'Chitra');
  await expect(page).toHaveURL(/\/home/);
  const id = await userIdByPhone('919999900004');
  const { data: consents } = await admin().from('consents').select('document,version').eq('user_id', id).order('document');
  const { data: legal } = await admin().from('platform_settings').select('value').eq('key', 'legal_versions').single();
  const v = legal!.value as Record<string, string>;
  expect(consents).toEqual([
    { document: 'privacy', version: v.privacy },
    { document: 'terms', version: v.terms },
  ]);
});

test('staff account login on web → error message', async ({ page }) => {
  await loginWithPhone(page, '9999900003');
  await completeOnboarding(page, 'Staff Person');
  await expect(page).toHaveURL(/\/home/);
  const id = await userIdByPhone('919999900003');
  await admin().from('staff').insert({ user_id: id, email: 'phone-staff@3nayan.test', role: 'support' });
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login\?error=staff/);
  await expect(page.getByText('Staff accounts sign in through the 3Nayan admin panel')).toBeVisible();
});

test('bumping the Terms version sends a signed-in user back to accept it', async ({ page }) => {
  await loginWithPhone(page, '9999900010');
  await completeOnboarding(page, 'Divya');
  await expect(page).toHaveURL(/\/home/);
  const db = admin();
  const { data } = await db.from('platform_settings').select('value').eq('key', 'legal_versions').single();
  const v = data!.value as Record<string, string>;
  await db.from('platform_settings').update({ value: { ...v, terms: 'draft-9' } }).eq('key', 'legal_versions');
  try {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/onboarding/);
  } finally {
    await db.from('platform_settings').update({ value: v }).eq('key', 'legal_versions');
  }
});
