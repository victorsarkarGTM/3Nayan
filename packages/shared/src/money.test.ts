import { describe, expect, it } from 'vitest';
import { percentToBps } from './money.ts';

describe('percentToBps', () => {
  it.each([['18', 1800], ['19.99', 1999], ['1.1', 110], ['0.07', 7], ['0', 0], ['50', 5000]])('%s%% → %i bps', (v, bps) =>
    expect(percentToBps(v)).toBe(bps));
  it.each(['50.01', '-1', 'abc', '', '1.234'])('rejects %s', (v) => expect(percentToBps(v)).toBeNull());
});
