import { expect, test } from '@playwright/test';
import { admin, loginAs, seedApplication } from './helpers';

test('trial Join is disabled 11 min before and enabled at 10 min before', async ({ page }) => {
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCSeconds(0, 0);
  await page.clock.install({ time: new Date(start.getTime() - 11 * 60_000) });
  const reviewer = await loginAs(page, 'reviewer');
  const app = await seedApplication();
  const db = admin();
  await db.from('practitioners').update({ status: 'trial_scheduled', assigned_reviewer_id: reviewer.userId }).eq('id', app.practitionerId);
  await db.from('trial_calls').insert({
    practitioner_id: app.practitionerId, reviewer_id: reviewer.userId, status: 'scheduled',
    proposed_slots: [start.toISOString()], scheduled_at: start.toISOString(), hms_room_id: 'fake-room-x',
  });
  await page.goto('/trials');
  const row = page.getByRole('row', { name: new RegExp(app.name) });
  await expect(row.getByRole('button', { name: 'Join call' })).toBeDisabled();
  await page.clock.fastForward('01:00');
  await expect(row.getByRole('link', { name: 'Join call' })).toBeVisible();
});

test('support suspends an approved practitioner; only super_admin can reinstate', async ({ page, browser }) => {
  const app = await seedApplication();
  await admin().from('practitioners').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', app.practitionerId);
  await loginAs(page, 'support');
  await page.goto('/practitioners');
  await page.getByLabel('Search by name or phone').fill(app.name);
  const row = page.getByRole('row', { name: new RegExp(app.name) });
  await row.getByRole('button', { name: 'Suspend' }).click();
  await page.getByLabel('Reason').fill('Multiple complaints under review');
  await page.getByRole('button', { name: `Suspend ${app.name}` }).click();
  await expect(row.getByText('Suspended')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Reinstate' })).toHaveCount(0);

  const boss = await browser.newPage();
  await loginAs(boss, 'super_admin');
  await boss.goto('/practitioners');
  await boss.getByLabel('Search by name or phone').fill(app.name);
  await expect(boss.getByRole('row', { name: new RegExp(app.name) }).getByRole('button', { name: 'Reinstate' })).toBeVisible();
});

test('a failed payout-account setup appears in Needs attention; Retry resolves it', async ({ page }) => {
  const app = await seedApplication();
  const db = admin();
  await db.from('practitioners').update({ status: 'approved' }).eq('id', app.practitionerId);
  await db.from('attention_items').insert({ kind: 'linked_account_failed', target_id: app.practitionerId, error: 'razorpay outage' });
  await loginAs(page, 'finance');
  await page.goto('/attention');
  const item = page.getByRole('listitem').filter({ hasText: app.name });
  await expect(item.getByText('razorpay outage')).toBeVisible();
  await item.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: app.name })).toHaveCount(0);
  const { data } = await db.from('practitioners').select('razorpay_account_id').eq('id', app.practitionerId).single();
  expect(data!.razorpay_account_id).toBeTruthy();
});

test('super_admin processes an account deletion request from Needs attention', async ({ page }) => {
  const app = await seedApplication();
  const db = admin();
  await db.from('profiles').update({ full_name: app.name }).eq('id', app.userId);
  const { data: req } = await db.from('deletion_requests').insert({ user_id: app.userId }).select('id').single();
  await db.from('attention_items').insert({ kind: 'deletion_requested', target_id: app.userId, metadata: { requestId: req!.id } });
  await loginAs(page, 'super_admin');
  await page.goto('/attention');
  const item = page.getByRole('listitem').filter({ hasText: app.name });
  await item.getByRole('button', { name: 'Process deletion' }).click();
  await page.getByRole('button', { name: `Delete ${app.name}’s account` }).click();
  await expect(page.getByRole('listitem').filter({ hasText: app.name })).toHaveCount(0);
  const { data } = await db.from('deletion_requests').select('status').eq('id', req!.id).single();
  expect(data!.status).toBe('completed');
});
