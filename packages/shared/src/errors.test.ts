import { describe, expect, it } from 'vitest';
import { ALL_ERROR_CODES, AppError, USER_MESSAGES } from './errors.ts';

describe('errors', () => {
  it('has a message for every code', () => {
    for (const c of ALL_ERROR_CODES) expect(USER_MESSAGES[c].length).toBeGreaterThan(10);
  });
  it('provider_unavailable message', () =>
    expect(USER_MESSAGES.provider_unavailable).toBe(
      "We couldn't verify this right now — please try again in a few minutes.",
    ));
  it('AppError carries its code', () => {
    const e = new AppError('conflict');
    expect(e.code).toBe('conflict');
    expect(e.message).toBe(USER_MESSAGES.conflict);
  });
});
