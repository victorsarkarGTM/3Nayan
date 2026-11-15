// Generates tokens.css (Tailwind v4 @theme) from tokens.json. Mobile reads tokens.json directly.
import { readFileSync, writeFileSync } from 'node:fs';
const t = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const lines = [
  '/* GENERATED from tokens.json by generate.mjs — do not edit. */',
  '@theme {',
  ...Object.entries(t.color).map(([k, v]) => `  --color-${k}: ${v};`),
  ...Object.entries(t.radius).map(([k, v]) => `  --radius-${k}: ${v};`),
  `  --font-sans: ${t.font.sans};`,
  '}',
  '',
];
writeFileSync(new URL('./tokens.css', import.meta.url), lines.join('\n'));
