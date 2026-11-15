import type { z } from 'zod';
import { AppError, USER_MESSAGES, type ErrorCode } from './core/index.ts';
import type { Deps } from './deps.ts';

export const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  invalid_transition: 400,
  incomplete_application: 400,
  reapply_too_soon: 400,
  outside_join_window: 400,
  kyc_attempts_exhausted: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  provider_unavailable: 503,
  internal: 500,
};

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders, ...headers },
  });
}

export function errorResponse(code: ErrorCode, details?: unknown): Response {
  return json(STATUS[code], { ok: false, error: { code, message: USER_MESSAGES[code], ...(details ? { details } : {}) } });
}

export type Handler = (req: Request, deps: Deps) => Promise<unknown>;

/** Wraps a handler in the 3Nayan function runtime contract (see plan: Function runtime contract). */
export function withHandler(handler: Handler, deps: () => Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders });
    if (req.method !== 'POST') return errorResponse('validation_failed');
    try {
      const data = await handler(req, deps());
      return json(200, { ok: true, data: data ?? null });
    } catch (err) {
      if (err instanceof AppError) return errorResponse(err.code, err.code === 'validation_failed' ? err.details : undefined);
      console.error('unhandled function error', err);
      return errorResponse('internal');
    }
  };
}

/** Parse and validate a JSON body; throws AppError('validation_failed') with field issues. */
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    const text = await req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError('validation_failed', [{ path: [], message: 'Body must be JSON' }]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(
      'validation_failed',
      result.error.issues.map((i) => ({ path: i.path, message: i.message })),
    );
  }
  return result.data;
}
