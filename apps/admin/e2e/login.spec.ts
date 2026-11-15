import { expect, test } from '@playwright/test';
import { createStaffUser, loginAs, staffLogin } from './helpers';

test('first login enrols TOTP then lands on /applications', async ({ page }) => {
  const u = await createStaffUser('reviewer');
  await staffLogin(page, u);
  await expect(page).toHaveURL(/\/applications/);
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
});

test('wrong TOTP shows error', async ({ page }) => {
  const u = await createStaffUser('reviewer');
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('totp-secret')).toBeVisible();
  await page.getByLabel('6-digit code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code didn’t work')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('non-staff account cannot access admin', async ({ page }) => {
  const u = await createStaffUser(null);
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This account doesn’t have access to the 3Nayan admin panel')).toBeVisible();
  await page.goto('/applications');
  await expect(page).toHaveURL(/\/login/);
});

test('reviewer sidebar hides Staff, Settings, Audit', async ({ page }) => {
  await loginAs(page, 'reviewer');
  const nav = page.getByRole('navigation', { name: 'Admin' });
  await expect(nav.getByRole('link', { name: 'Applications' })).toBeVisible();
  await expect(nav.getByRole('link', { name: /Staff/ })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
});

test('super_admin sees every section', async ({ page }) => {
  await loginAs(page, 'super_admin');
  const nav = page.getByRole('navigation', { name: 'Admin' });
  for (const name of ['Applications', 'My trial calls', 'Practitioners', 'Needs attention', 'Categories', 'Staff', 'Settings', 'Audit log'])
    await expect(nav.getByRole('link', { name })).toBeVisible();
});
