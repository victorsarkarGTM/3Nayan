import { NAME_MATCH_THRESHOLD } from '../constants.ts';

// 'KUMARI' is deliberately not here: it is also a common given/middle name.
const HONORIFICS = new Set(['MR', 'MRS', 'MS', 'DR', 'SHRI', 'SMT']);

/** Uppercase, drop honorifics and non-letters, collapse spaces, sort tokens alphabetically. */
export function normaliseName(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !HONORIFICS.has(t))
    .sort()
    .join(' ');
}

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(b.length - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!bMatched[j] && a[i] === b[j]) {
        aMatched[i] = bMatched[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  return (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
}

function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

/** A token below this similarity is treated as a different word, not a spelling variant. */
const TOKEN_VARIANT_MIN = 0.88;

/** An initial only weakly identifies a word ("P" could be Priya or Pradeep). */
const INITIAL_SCORE = 0.8;
/** A name with fewer than two full words can match, but never passes on its own. */
const PARTIAL_NAME_CAP = 0.84;

function tokenScore(t: string, u: string): number {
  if (t === u) return 1;
  if ((t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u))) return INITIAL_SCORE;
  if (t.length === 1 || u.length === 1) return 0;
  const jw = jaroWinkler(t, u);
  return jw >= TOKEN_VARIANT_MIN ? jw : 0;
}

/**
 * Similarity 0–1 between two personal names. Each word of the shorter name is paired with its best
 * unused word in the longer name (exact = 1, initial = 1, close spelling variant = its Jaro-Winkler
 * score, anything else = 0); the result is the mean. Initials score 0.8, and a name with fewer than two
 * full words is capped below the pass mark, so "P Sharma" or "KUMAR" always goes to a reviewer.
 * Order, case, honorifics and omitted middle names are tolerated; a different first or last name is not.
 */
export function nameMatchScore(a: string, b: string): number {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Array<boolean>(longer.length).fill(false);
  let total = 0;
  for (const t of shorter) {
    let best = 0;
    let bestIdx = -1;
    longer.forEach((u, i) => {
      if (used[i]) return;
      const s = tokenScore(t, u);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used[bestIdx] = true;
    total += best;
  }
  const score = total / shorter.length;
  const fullWords = shorter.filter((t) => t.length > 1).length;
  return fullWords < 2 ? Math.min(score, PARTIAL_NAME_CAP) : score;
}

export function classifyNameMatch(scores: number[]): 'passed' | 'flagged' {
  return scores.every((s) => s >= NAME_MATCH_THRESHOLD) ? 'passed' : 'flagged';
}
