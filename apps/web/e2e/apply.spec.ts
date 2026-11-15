import { expect, test } from '@playwright/test';
import { admin, fillSteps1to4, fillSteps5and6, fixture, practitionerIdFor, signUp } from './helpers';

test('complete all 6 steps with fake KYC → submit → status Submitted', async ({ page }) => {
  await signUp(page, '9999900005');
  await fillSteps1to4(page);
  await fillSteps5and6(page);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/practitioner\/status/);
  await expect(page.getByRole('heading', { name: 'Application submitted' })).toBeVisible();
});

test('resume: reload mid step 3 keeps step 1–2 data', async ({ page }) => {
  await signUp(page, '9999900006');
  await page.goto('/practitioner/apply/1');
  await page.getByLabel('Display name').fill('Resume Test');
  await page.getByLabel('Years of experience').fill('3');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.goto('/practitioner/apply/2');
  await page.getByRole('checkbox', { name: 'Online sessions' }).check();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.goto('/practitioner/apply/3');
  await page.reload();
  await page.goto('/practitioner/apply/1');
  await expect(page.getByLabel('Display name')).toHaveValue('Resume Test');
  await expect(page.getByLabel('Years of experience')).toHaveValue('3');
  await page.goto('/practitioner/apply/2');
  await expect(page.getByRole('checkbox', { name: 'Online sessions' })).toBeChecked();
});

test("video 20s fixture shows 'Video must be 30–120 seconds'", async ({ page }) => {
  await signUp(page, '9999900007');
  await page.goto('/practitioner/apply/4');
  await page.getByLabel('Introduction video').setInputFiles(fixture('intro-20s.mp4'));
  await expect(page.getByText('Video must be 30–120 seconds')).toBeVisible();
});

test('submit button disabled until all steps complete', async ({ page }) => {
  await signUp(page, '9999900008');
  await page.goto('/practitioner/apply/6');
  await expect(page.getByRole('button', { name: 'Submit application' })).toBeDisabled();
  await expect(page.getByText(/still need completing/)).toBeVisible();
});

test('changes_requested shows reason and allows edit + resubmit; trial slots show in IST', async ({ page }) => {
  await signUp(page, '9999900009');
  await fillSteps1to4(page);
  await fillSteps5and6(page);
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Application submitted' })).toBeVisible();

  const pid = await practitionerIdFor('919999900009');
  const db = admin();
  await db.from('practitioners').update({ status: 'changes_requested' }).eq('id', pid);
  await db.from('practitioner_status_history').insert({
    practitioner_id: pid, from_status: 'in_review', to_status: 'changes_requested', action: 'request_changes',
    actor_kind: 'staff', reason: 'Please add a clearer certificate',
  });
  await page.goto('/practitioner/status');
  await expect(page.getByText('Please add a clearer certificate')).toBeVisible();
  await page.getByRole('link', { name: 'Update application' }).click();
  await page.goto('/practitioner/apply/6');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Application submitted' })).toBeVisible();

  // Trial proposed (set directly): three IST slots, pick one.
  const { data: staff } = await db.auth.admin.createUser({ email: `rev-${Date.now()}@staff.3nayan.test`, email_confirm: true });
  const base = Date.UTC(2030, 0, 7, 4, 30); // 10:00 IST
  const slots = [0, 1, 2].map((d) => new Date(base + d * 86_400_000).toISOString());
  await db.from('practitioners').update({ status: 'in_review' }).eq('id', pid);
  await db.from('trial_calls').insert({ practitioner_id: pid, reviewer_id: staff.user!.id, proposed_slots: slots, proposed_at: new Date().toISOString(), status: 'proposed' });
  await page.goto('/practitioner/status');
  await expect(page.getByText('Mon, 7 Jan 2030, 10:00 am IST')).toBeVisible();
  await expect(page.getByText('Wed, 9 Jan 2030, 10:00 am IST')).toBeVisible();
  await page.getByRole('radio', { name: 'Tue, 8 Jan 2030, 10:00 am IST' }).check();
  await page.getByRole('button', { name: 'Confirm this time' }).click();
  await expect(page.getByText('Your trial call is on Tue, 8 Jan 2030, 10:00 am IST')).toBeVisible();
});
