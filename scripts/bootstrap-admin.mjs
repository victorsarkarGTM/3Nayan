#!/usr/bin/env node
// Create (or confirm) the first super-admin. Idempotent.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… ADMIN_URL=https://admin.example.com \
//     node scripts/bootstrap-admin.mjs --email founder@example.com [--send-password-link]
// They receive an invitation email to set a password, then enrol two-factor sign-in at first login.
import { createClient } from '@supabase/supabase-js';

const i = process.argv.indexOf('--email');
const email = i > 0 ? process.argv[i + 1]?.trim().toLowerCase() : '';
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node scripts/bootstrap-admin.mjs --email <address>');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role key of the target project).');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function findUser() {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit || data.users.length < 200) return hit ?? null;
  }
  return null;
}

const redirectTo = process.env.ADMIN_URL ? `${process.env.ADMIN_URL.replace(/\/$/, '')}/auth/accept` : undefined;
let user = await findUser();
if (!user) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  user = data.user;
  console.log(`Invited ${email}: they set a password from the email link.`);
} else if (process.argv.includes('--send-password-link')) {
  const { error } = await db.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  console.log(`Sent a password link to ${email}.`);
}
const { error } = await db.from('staff').upsert({ user_id: user.id, email, role: 'super_admin', active: true });
if (error) throw error;
console.log(`${email} is a super-admin.`);
