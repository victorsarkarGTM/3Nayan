import { execFileSync, execSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const out = execSync('pnpm --silent --filter @3nayan/db exec supabase --workdir ../.. status -o env', { encoding: 'utf8' });
const get = (k) => out.match(new RegExp(`^${k}="?(.*?)"?$`, 'm'))?.[1];
const env = { ...process.env, SUPABASE_URL: get('API_URL'), SUPABASE_SERVICE_ROLE_KEY: get('SERVICE_ROLE_KEY') };

test('bootstrap-admin twice is idempotent', async () => {
  const email = `founder-${Date.now()}@3nayan.test`;
  for (let i = 0; i < 2; i++) execFileSync('node', ['scripts/bootstrap-admin.mjs', '--email', email], { env, stdio: 'pipe' });
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await db.from('staff').select('role,active').eq('email', email);
  assert.deepEqual(data, [{ role: 'super_admin', active: true }]);
});
