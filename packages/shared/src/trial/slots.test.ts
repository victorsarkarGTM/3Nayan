import { describe, expect, it } from 'vitest';
import { formatIST, isWithinJoinWindow, joinWindow, trialDueActions, validateProposedSlots } from './slots.ts';

const now = new Date('2026-11-15T10:00:00Z');
const plusMin = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const iso = (d: Date) => d.toISOString();
const day = (n: number) => plusMin(now, n * 24 * 60);

describe('validateProposedSlots', () => {
  it('2 slots → count', () =>
    expect(validateProposedSlots([iso(day(2)), iso(day(3))], now)).toEqual({ ok: false, reason: 'count' }));
  it('slot at now+23h59m → lead_time', () =>
    expect(validateProposedSlots([iso(plusMin(now, 23 * 60 + 59)), iso(day(2)), iso(day(3))], now)).toEqual({
      ok: false,
      reason: 'lead_time',
    }));
  it('overlapping 10:00 and 10:15 → overlap', () => {
    const a = day(2);
    expect(validateProposedSlots([iso(a), iso(plusMin(a, 15)), iso(day(3))], now)).toEqual({
      ok: false,
      reason: 'overlap',
    });
  });
  it('garbage date → invalid_date', () =>
    expect(validateProposedSlots(['nope', iso(day(2)), iso(day(3))], now)).toEqual({ ok: false, reason: 'invalid_date' }));
  it('three valid → ok', () => {
    const r = validateProposedSlots([iso(day(1)), iso(day(2)), iso(day(3))], now);
    expect(r.ok).toBe(true);
  });
});

describe('join window', () => {
  const start = day(2);
  it('opens at start-10m exactly (inclusive) and closes at start+60m (inclusive)', () => {
    expect(joinWindow(start)).toEqual({ opensAt: plusMin(start, -10), closesAt: plusMin(start, 60) });
    expect(isWithinJoinWindow(start, plusMin(start, -10))).toBe(true);
    expect(isWithinJoinWindow(start, plusMin(start, -11))).toBe(false);
    expect(isWithinJoinWindow(start, plusMin(start, 60))).toBe(true);
    expect(isWithinJoinWindow(start, plusMin(start, 61))).toBe(false);
  });
});

describe('trialDueActions', () => {
  it('at 72h without reminder → [send_pick_reminder]', () =>
    expect(trialDueActions(now, plusMin(now, 72 * 60), false)).toEqual(['send_pick_reminder']));
  it('at 72h with reminder already sent → []', () => expect(trialDueActions(now, plusMin(now, 72 * 60), true)).toEqual([]));
  it("at 7d → includes 'expire'", () => expect(trialDueActions(now, day(7), true)).toContain('expire'));
  it('before 72h → []', () => expect(trialDueActions(now, plusMin(now, 71 * 60), false)).toEqual([]));
});

describe('formatIST', () => {
  it("formats in IST regardless of device time zone", () => {
    const prev = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(formatIST(new Date('2026-11-16T10:00:00Z'))).toBe('Mon, 16 Nov 2026, 3:30 pm IST');
    } finally {
      process.env.TZ = prev;
    }
  });
});
