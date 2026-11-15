#!/usr/bin/env node
// Copies packages/shared/src (minus tests) into supabase/functions/_shared/core so Edge Functions run
// exactly the same business rules as the apps. `--check` exits 1 if the copy is stale (used in CI).
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/shared/src');
const dest = join(root, 'supabase/functions/_shared/core');
const HEADER = '// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.\n';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const expected = new Map(
  walk(src)
    .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
    .map((p) => [relative(src, p), HEADER + readFileSync(p, 'utf8')]),
);

if (process.argv.includes('--check')) {
  let actual = new Map();
  try {
    actual = new Map(walk(dest).map((p) => [relative(dest, p), readFileSync(p, 'utf8')]));
  } catch {
    /* missing dir = stale */
  }
  const stale =
    actual.size !== expected.size || [...expected].some(([rel, content]) => actual.get(rel) !== content);
  if (stale) {
    console.error('supabase/functions/_shared/core is out of date. Run: node scripts/sync-shared.mjs');
    process.exit(1);
  }
  console.log('shared core is in sync');
} else {
  rmSync(dest, { recursive: true, force: true });
  for (const [rel, content] of expected) {
    mkdirSync(dirname(join(dest, rel)), { recursive: true });
    writeFileSync(join(dest, rel), content);
  }
  console.log(`synced ${expected.size} files into supabase/functions/_shared/core`);
}
