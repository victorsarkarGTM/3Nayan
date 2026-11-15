import { AppError, type ErrorCode, ALL_ERROR_CODES } from '@3nayan/shared';
import type { Sb } from './types.ts';

let functionsUrlOverride: string | null = null;

/** Point function calls somewhere other than `${SUPABASE_URL}/functions/v1` (e.g. the local dev server). */
export function configureFunctionsUrl(url: string | null) {
  functionsUrlOverride = url ? url.replace(/\/$/, '') : null;
}

function internals(sb: Sb): { supabaseUrl: string; supabaseKey: string; fetch: typeof fetch } {
  const s = sb as unknown as { supabaseUrl: string; supabaseKey: string; fetch?: typeof fetch; rest: { fetch: typeof fetch } };
  return { supabaseUrl: s.supabaseUrl, supabaseKey: s.supabaseKey, fetch: s.fetch ?? s.rest.fetch ?? fetch };
}

/** Call an Edge Function and unwrap the runtime contract; failures throw AppError(code). */
export async function callFunction<T>(sb: Sb, name: string, body: unknown): Promise<T> {
  const { supabaseUrl, supabaseKey, fetch: f } = internals(sb);
  const base = functionsUrlOverride ?? `${supabaseUrl}/functions/v1`;
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token ?? supabaseKey;
  let res: Response;
  try {
    res = await f(`${base}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: supabaseKey, authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AppError('internal', undefined, "We couldn't reach 3Nayan. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } }
    | null;
  if (json && json.ok) return json.data;
  const code = (json && !json.ok && (ALL_ERROR_CODES as readonly string[]).includes(json.error.code)
    ? json.error.code
    : 'internal') as ErrorCode;
  throw new AppError(code, json && !json.ok ? json.error.details : undefined, json && !json.ok ? json.error.message : undefined);
}

type QueryResult<T> = { data: T; error: { message: string; code?: string } | null };

function raise(error: { message: string; code?: string }): never {
  if (error.code === '42501') throw new AppError('forbidden');
  if (error.code === '23514') throw new AppError('validation_failed', [{ path: [], message: error.message }]);
  throw new AppError('internal', error.message);
}

/** Unwrap a query that always returns data (lists, single, mutations); errors become AppError. */
export function check<T>(result: QueryResult<T>): NonNullable<T> {
  if (result.error) raise(result.error);
  return result.data as NonNullable<T>;
}

/** Unwrap a `.maybeSingle()` query: null when no row matched. */
export function checkMaybe<T>(result: QueryResult<T>): T {
  if (result.error) raise(result.error);
  return result.data;
}
