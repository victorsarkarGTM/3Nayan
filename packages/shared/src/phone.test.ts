import { describe, expect, it } from 'vitest';
import { normaliseIndianPhone } from './phone.ts';

describe('normaliseIndianPhone', () => {
  it.each(['9876543210', '98765 43210', '+91-98765-43210', '09876543210', '919876543210', '+91 98765 43210'])(
    'normalises %s',
    (v) => expect(normaliseIndianPhone(v)).toBe('+919876543210'),
  );
  it.each(['12345', '5876543210', '98765432101', '+1 415 555 0100', 'abcdefghij', ''])('rejects %s', (v) =>
    expect(normaliseIndianPhone(v)).toBeNull(),
  );
});
