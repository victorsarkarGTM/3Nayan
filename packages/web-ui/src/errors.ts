import { AppError, USER_MESSAGES } from '@3nayan/shared';

/** Plain-language message for any thrown error. */
export function messageFor(e: unknown): string {
  if (e instanceof AppError) return e.message || USER_MESSAGES[e.code];
  return USER_MESSAGES.internal;
}

/** First field-level message from a validation AppError, keyed by dotted path. */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof AppError) || e.code !== 'validation_failed' || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as Array<{ path: Array<string | number>; message: string }>) {
    const key = d.path.join('.');
    if (!out[key]) out[key] = d.message;
  }
  return out;
}
