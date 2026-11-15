import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { localEnv } from './env';
import { admin, loginAs } from './helpers';

const env = localEnv();

test.afterAll(async () => {
  await admin().from('platform_settings').update({ value: { bps: 2000 } }).eq('key', 'commission_rate');
  await admin().from('platform_settings').update({ value: { terms: 'draft-1', privacy: 'draft-1', practitioner_agreement: 'draft-1' } }).eq('key', 'legal_versions');
});

test('super_admin adds a subcategory and deactivates it; public category list excludes it', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await page.goto('/categories');
  const name = `Akashic ${Date.now().toString().slice(-5)}`;
  await page.getByLabel('Parent category').selectOption({ label: 'Psychic' });
  await page.getByLabel('Subcategory name').fill(name);
  await page.getByRole('button', { name: 'Add subcategory' }).click();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toBeVisible();
  const anon = createClient(env.url, env.anon, { auth: { persistSession: false } });
  expect((await anon.from('categories').select('id').eq('name', name)).data).toHaveLength(1);
  await row.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row.getByRole('button', { name: 'Activate' })).toBeVisible();
  expect((await anon.from('categories').select('id').eq('name', name)).data).toHaveLength(0);
});

test('commission above 50% is rejected', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await page.goto('/settings');
  await page.getByLabel('Commission (%)').fill('50.01');
  await page.getByRole('button', { name: 'Save commission' }).click();
  await expect(page.getByText('Enter a commission between 0% and 50%')).toBeVisible();
  await page.getByLabel('Commission (%)').fill('18');
  await page.getByRole('button', { name: 'Save commission' }).click();
  await expect(page.getByText('Commission saved')).toBeVisible();
  const { data } = await admin().from('platform_settings').select('value').eq('key', 'commission_rate').single();
  expect(data!.value).toEqual({ bps: 1800 });
});

test('bumping the Terms version is saved', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await page.goto('/settings');
  await page.getByLabel('Terms of Use version').fill('draft-2');
  await page.getByRole('button', { name: 'Save legal versions' }).click();
  await expect(page.getByText('Legal versions saved')).toBeVisible();
  const { data } = await admin().from('platform_settings').select('value').eq('key', 'legal_versions').single();
  expect((data!.value as Record<string, string>).terms).toBe('draft-2');
});

test('staff invite creates a staff member; audit log filters by action', async ({ page }) => {
  await loginAs(page, 'super_admin');
  await page.goto('/staff');
  const email = `invitee-${Date.now()}@staff.3nayan.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption('support');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByRole('row', { name: new RegExp(email) })).toBeVisible();

  await page.goto('/audit');
  await page.getByLabel('Action').fill('staff.invite');
  await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'document.view' })).toHaveCount(0);
});
