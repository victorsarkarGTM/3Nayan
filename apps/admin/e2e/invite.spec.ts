import { expect, test, type Page } from '@playwright/test';
import { createStaffUser, loginAs, totp } from './helpers';

const MAILPIT = 'http://127.0.0.1:54334';

/** Latest email to `to` in the local mail catcher (Mailpit); returns the first auth link in it. */
async function linkFor(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const m = String(msg.HTML ?? msg.Text).match(/https?:\/\/[^"'\s]+\/auth\/v1\/verify[^"'\s]*/);
      if (m) return m[0].replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email for ${to}`);
}

async function setPasswordAndSignIn(page: Page, email: string, link: string, password: string) {
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/accept/);
  await page.getByLabel('New password').fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Password set. Sign in to continue.')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('an invited staff member sets a password, enrols two-factor and reaches the admin panel', async ({ page, browser }) => {
  await loginAs(page, 'super_admin');
  await page.goto('/staff');
  const email = `invited-${Date.now()}@staff.3nayan.test`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption('reviewer');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const invitee = await browser.newPage();
  await setPasswordAndSignIn(invitee, email, await linkFor(email), 'Correct-Horse-Battery-1');
  const secret = (await invitee.getByTestId('totp-secret').textContent())!.replace(/\s/g, '');
  await invitee.getByLabel('6-digit code').fill(totp(secret));
  await invitee.getByRole('button', { name: 'Verify' }).click();
  await expect(invitee).toHaveURL(/\/applications/);
});

test('forgot password sends a link that lets staff choose a new password', async ({ page }) => {
  const u = await createStaffUser('support');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(u.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If that email belongs to a staff account, we’ve sent a link')).toBeVisible();
  await setPasswordAndSignIn(page, u.email, await linkFor(u.email), 'New-Strong-Password-2');
  await expect(page.getByTestId('totp-secret')).toBeVisible();
});
