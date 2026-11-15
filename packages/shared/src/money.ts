/** Parse a commission percentage typed by staff ("19.99") into basis points (1999); null if invalid. */
export function percentToBps(input: string): number | null {
  const s = input.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$|^100$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const bps = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return bps <= 5000 ? bps : null;
}
