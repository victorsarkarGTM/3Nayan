export const ALL_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'validation_failed',
  'not_found',
  'conflict',
  'invalid_transition',
  'incomplete_application',
  'rate_limited',
  'provider_unavailable',
  'kyc_attempts_exhausted',
  'outside_join_window',
  'reapply_too_soon',
  'internal',
] as const;
export type ErrorCode = (typeof ALL_ERROR_CODES)[number];

/** Plain-language messages: never blame the user, always suggest a next step. */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  unauthenticated: 'Your session has ended. Please sign in again to continue.',
  forbidden: "This action isn't available for your account. If you think it should be, contact 3Nayan support.",
  validation_failed: 'Some details need another look. Please check the highlighted fields and try again.',
  not_found: "We couldn't find what you were looking for. Please go back and try again.",
  conflict: "This was just updated by someone else. We've refreshed it — please check and try again.",
  invalid_transition: "This step isn't available right now. Please refresh to see the latest status.",
  incomplete_application: 'A few sections still need completing. Finish the steps marked incomplete, then submit.',
  rate_limited: "You've tried this several times in a short while. Please wait a little and try again.",
  provider_unavailable: "We couldn't verify this right now — please try again in a few minutes.",
  kyc_attempts_exhausted:
    "You've used all verification attempts for today. Please try again after 24 hours, or contact support.",
  outside_join_window: 'This call opens 10 minutes before the start time. Please come back then.',
  reapply_too_soon: 'You can apply again once the waiting period ends. We show the date on your status page.',
  internal: 'Something went wrong on our side. Please try again — if it keeps happening, contact support.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(code: ErrorCode, details?: unknown, message?: string) {
    super(message ?? USER_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
