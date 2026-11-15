// Writes the Tailwind v4 @theme block generated from tokens.json into each app stylesheet passed as an
// argument, between `/* tokens:start */` and `/* tokens:end */`. Mobile reads tokens.json directly.
// Usage: node packages/ui-tokens/generate.mjs apps/web/src/app/globals.css [more.css] [--check]
import { readFileSync, writeFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const block = [
  '/* tokens:start — GENERATED from packages/ui-tokens/tokens.json; run `pnpm tokens` */',
  '@theme {',
  ...Object.entries(t.color).map(([k, v]) => `  --color-${k}: ${v};`),
  ...Object.entries(t.radius).map(([k, v]) => `  --radius-${k}: ${v};`),
  `  --font-sans: ${t.font.sans};`,
  '}',
  '/* tokens:end */',
].join('\n');
const check = process.argv.includes('--check');
let stale = false;
for (const file of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const css = readFileSync(file, 'utf8');
  const re = /\/\* tokens:start[\s\S]*?\/\* tokens:end \*\//;
  if (!re.test(css)) throw new Error(`${file} has no tokens:start/end markers`);
  const next = css.replace(re, block);
  if (next !== css) {
    stale = true;
    if (!check) writeFileSync(file, next);
  }
}
if (check && stale) {
  console.error('Design tokens are out of date. Run: pnpm tokens');
  process.exit(1);
}
