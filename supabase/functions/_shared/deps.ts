import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FakeSms } from './providers/msg91/fake.ts';
import { Msg91Sms } from './providers/msg91/real.ts';
import type { SmsProvider } from './providers/msg91/types.ts';

export type Env = (key: string) => string | undefined;

export type Deps = {
  /** Service-role client: bypasses RLS. Every handler must authorise the caller itself. */
  db: SupabaseClient;
  now: () => Date;
  env: Env;
  sms: SmsProvider;
};

export function serviceClientFrom(env: Env): SupabaseClient {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function makeDeps(env: Env): Deps {
  const real = env('PROVIDERS') === 'real';
  return {
    db: serviceClientFrom(env),
    now: () => new Date(),
    env,
    sms: real ? new Msg91Sms(env) : new FakeSms(),
  };
}
