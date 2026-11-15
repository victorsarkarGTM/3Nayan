import { AppError, USER_MESSAGES } from '@3nayan/shared';

export function messageForError(e: unknown): string {
  if (e instanceof AppError) return e.message || USER_MESSAGES[e.code];
  return USER_MESSAGES.internal;
}
