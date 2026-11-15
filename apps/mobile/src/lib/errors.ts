import { AppError, USER_MESSAGES } from '@3nayan/shared';

export function messageForError(e: unknown): string {
  if (e instanceof AppError) return e.message || USER_MESSAGES[e.code];
  return USER_MESSAGES.internal;
}

export function fieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof AppError) || e.code !== 'validation_failed' || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as Array<{ path: Array<string | number>; message: string }>) out[d.path.join('.')] ??= d.message;
  return out;
}
