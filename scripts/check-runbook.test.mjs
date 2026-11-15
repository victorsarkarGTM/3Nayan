// Every environment variable the shipped code reads must be documented in docs/runbooks/staging.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const SKIP = /(node_modules|\.next|dist|\.expo|\/tests?\/|\/e2e\/|\.test\.|_shared\/core\/)/;
const DIRS = ['apps', 'packages', 'supabase/functions'];
// Provided by the platform at runtime, not configured by us.
const PLATFORM = new Set(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'NODE_ENV', 'TZ', 'CI', 'FUNCTIONS_DEV_PORT']);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (SKIP.test(p + '/')) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(p) ? [p] : [];
  });
}

function referencedVars() {
  const found = new Map();
  const patterns = [/deps\.env\(\s*['"`]([A-Z0-9_]+)['"`]/g, /\benv\(\s*['"`]([A-Z0-9_]+)['"`]/g, /process\.env\.([A-Z0-9_]+)/g, /Deno\.env\.get\(\s*['"`]([A-Z0-9_]+)['"`]/g];
  for (const dir of DIRS)
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const re of patterns) for (const m of src.matchAll(re)) if (!PLATFORM.has(m[1])) found.set(m[1], relative(root, file));
      // MSG91 template ids are read by key: MSG91_TEMPLATE_<KEY>
      if (src.includes('MSG91_TEMPLATE_${')) found.set('MSG91_TEMPLATE_*', relative(root, file));
    }
  return found;
}

test('every referenced env var is documented in the runbook', () => {
  const runbook = readFileSync(join(root, 'docs/runbooks/staging.md'), 'utf8');
  const missing = [...referencedVars()].filter(([name]) => !runbook.includes(`\`${name}\``)).map(([n, f]) => `${n} (${f})`);
  assert.deepEqual(missing, [], `Document these in docs/runbooks/staging.md:\n${missing.join('\n')}`);
});
