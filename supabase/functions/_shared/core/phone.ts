// GENERATED — edit packages/shared/src and run `node scripts/sync-shared.mjs`.
/** Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX), or null if it is not a valid mobile. */
export function normaliseIndianPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[+\d][\d\s\-()]*$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (!digits.startsWith('91')) return null;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}
