import { expect, test } from '@playwright/test';
import { admin, istInput, loginAs, seedApplication } from './helpers';

test('queue lists submitted applications; flagged filter works', async ({ page }) => {
  const clean = await seedApplication();
  const flagged = await seedApplication({ flagged: true });
  await loginAs(page, 'reviewer');
  await page.goto('/applications');
  await expect(page.getByRole('link', { name: clean.name })).toBeVisible();
  await expect(page.getByRole('link', { name: flagged.name })).toBeVisible();
  await page.getByLabel('Flagged checks only').check();
  await expect(page.getByRole('link', { name: flagged.name })).toBeVisible();
  await expect(page.getByRole('link', { name: clean.name })).toHaveCount(0);
});

test('claim → request changes requires a reason → applicant status changes_requested', async ({ page }) => {
  const app = await seedApplication();
  await loginAs(page, 'reviewer');
  await page.goto(`/applications/${app.practitionerId}`);
  await page.getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText('In review')).toBeVisible();
  await page.getByRole('button', { name: 'Request changes' }).click();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Add a reason the applicant will see')).toBeVisible();
  await page.getByLabel('Reason for the applicant').fill('Please upload a clearer certificate.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Changes requested')).toBeVisible();
  const { data } = await admin().from('practitioners').select('status').eq('id', app.practitionerId).single();
  expect(data!.status).toBe('changes_requested');
});

test('propose trial with a slot under 24h shows a validation error', async ({ page }) => {
  const app = await seedApplication();
  await loginAs(page, 'reviewer');
  await page.goto(`/applications/${app.practitionerId}`);
  await page.getByRole('button', { name: 'Claim' }).click();
  await page.getByRole('button', { name: 'Propose trial times' }).click();
  await page.getByLabel('Time 1 (IST)').fill(istInput(2));
  await page.getByLabel('Time 2 (IST)').fill(istInput(50));
  await page.getByLabel('Time 3 (IST)').fill(istInput(74));
  await page.getByRole('button', { name: 'Send times' }).click();
  await expect(page.getByText('Each time must be at least 24 hours from now')).toBeVisible();
});

test('propose → applicant picks → outcome completed → approve → payout account created; document view is audited', async ({ page }) => {
  const app = await seedApplication();
  const reviewer = await loginAs(page, 'reviewer');
  await page.goto(`/applications/${app.practitionerId}`);

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'View reiki-master.pdf' }).click();
  await (await popup).close();
  await expect
    .poll(async () => (await admin().from('audit_log').select('id').eq('action', 'document.view').eq('target_id', app.practitionerId)).data?.length)
    .toBe(1);

  await page.getByRole('button', { name: 'Claim' }).click();
  await page.getByRole('button', { name: 'Propose trial times' }).click();
  await page.getByLabel('Time 1 (IST)').fill(istInput(30));
  await page.getByLabel('Time 2 (IST)').fill(istInput(54));
  await page.getByLabel('Time 3 (IST)').fill(istInput(78));
  await page.getByRole('button', { name: 'Send times' }).click();
  await expect(page.getByText('Waiting for the applicant to pick a time')).toBeVisible();

  // Applicant picks the first slot (simulated directly).
  const db = admin();
  const { data: trial } = await db.from('trial_calls').select('id,proposed_slots').eq('practitioner_id', app.practitionerId).eq('status', 'proposed').single();
  await db.from('trial_calls').update({ status: 'scheduled', scheduled_at: trial!.proposed_slots[0], hms_room_id: 'fake-room' }).eq('id', trial!.id);
  await db.from('practitioners').update({ status: 'trial_scheduled' }).eq('id', app.practitionerId);
  expect(reviewer.userId).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Record outcome' }).click();
  await page.getByRole('radio', { name: 'Completed' }).check();
  await page.getByLabel('Notes from the call').fill('Warm, clear, ethical. Recommend approval.');
  await page.getByRole('button', { name: 'Save outcome' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: `Approve ${app.name}` }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText('Payout account: created')).toBeVisible();
});

test('a stale action in a second tab shows the conflict message', async ({ page, context }) => {
  const app = await seedApplication();
  await loginAs(page, 'reviewer');
  await page.goto(`/applications/${app.practitionerId}`);
  await page.getByRole('button', { name: 'Claim' }).click();
  await expect(page.getByText('In review')).toBeVisible();
  const tab2 = await context.newPage();
  await tab2.goto(`/applications/${app.practitionerId}`);
  await expect(tab2.getByRole('button', { name: 'Request changes' })).toBeVisible();

  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByLabel('Reason for the applicant').fill('Not eligible at this time.');
  await page.getByRole('button', { name: `Reject ${app.name}` }).click();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();

  await tab2.getByRole('button', { name: 'Request changes' }).click();
  await tab2.getByLabel('Reason for the applicant').fill('Clearer photo please.');
  await tab2.getByRole('button', { name: 'Send request' }).click();
  await expect(tab2.getByText('This was just updated by someone else')).toBeVisible();
  await expect(tab2.getByText('Rejected', { exact: true })).toBeVisible();
});
