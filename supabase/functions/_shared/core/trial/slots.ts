// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
import { IST_TIMEZONE } from '../constants.ts';

export const TRIAL_SLOT_MINUTES = 30;
export const TRIAL_MIN_LEAD_HOURS = 24;
export const TRIAL_PICK_REMINDER_HOURS = 72;
export const TRIAL_EXPIRY_DAYS = 7;
export const TRIAL_PROPOSED_SLOT_COUNT = 3;
const JOIN_OPENS_BEFORE_MIN = 10;
const JOIN_CLOSES_AFTER_END_MIN = 30;

const MIN = 60_000;
const HOUR = 60 * MIN;

export type SlotValidation =
  | { ok: true; starts: Date[] }
  | { ok: false; reason: 'count' | 'lead_time' | 'overlap' | 'invalid_date' };

export function validateProposedSlots(startsIso: string[], now: Date): SlotValidation {
  if (startsIso.length !== TRIAL_PROPOSED_SLOT_COUNT) return { ok: false, reason: 'count' };
  const starts = startsIso.map((s) => new Date(s));
  if (starts.some((d) => Number.isNaN(d.getTime()))) return { ok: false, reason: 'invalid_date' };
  const earliest = now.getTime() + TRIAL_MIN_LEAD_HOURS * HOUR;
  if (starts.some((d) => d.getTime() < earliest)) return { ok: false, reason: 'lead_time' };
  const sorted = [...starts].sort((a, b) => a.getTime() - b.getTime());
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.getTime() < sorted[i - 1]!.getTime() + TRIAL_SLOT_MINUTES * MIN) {
      return { ok: false, reason: 'overlap' };
    }
  }
  return { ok: true, starts };
}

export function joinWindow(start: Date): { opensAt: Date; closesAt: Date } {
  return {
    opensAt: new Date(start.getTime() - JOIN_OPENS_BEFORE_MIN * MIN),
    closesAt: new Date(start.getTime() + (TRIAL_SLOT_MINUTES + JOIN_CLOSES_AFTER_END_MIN) * MIN),
  };
}

export function isWithinJoinWindow(start: Date, now: Date): boolean {
  const { opensAt, closesAt } = joinWindow(start);
  return now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime();
}

export function trialDueActions(
  proposedAt: Date,
  now: Date,
  pickReminderSent: boolean,
): Array<'send_pick_reminder' | 'expire'> {
  const elapsed = now.getTime() - proposedAt.getTime();
  const actions: Array<'send_pick_reminder' | 'expire'> = [];
  if (!pickReminderSent && elapsed >= TRIAL_PICK_REMINDER_HOURS * HOUR) actions.push('send_pick_reminder');
  if (elapsed >= TRIAL_EXPIRY_DAYS * 24 * HOUR) actions.push('expire');
  return actions;
}

const IST_PARTS = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** e.g. "Mon, 16 Nov 2026, 3:30 pm IST" — always IST, whatever the device time zone. */
export function formatIST(d: Date): string {
  const p = Object.fromEntries(IST_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()} IST`;
}
