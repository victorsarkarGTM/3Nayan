import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FakeSms, FakeWhatsApp } from './providers/msg91/fake.ts';
import { Msg91Sms, Msg91WhatsApp } from './providers/msg91/real.ts';
import type { SmsProvider, WhatsAppProvider } from './providers/msg91/types.ts';
import { FakePush } from './providers/push/fake.ts';
import { ExpoPush } from './providers/push/real.ts';
import type { PushProvider } from './providers/push/types.ts';
import { FakeHms } from './providers/hms/fake.ts';
import { Hms100ms } from './providers/hms/real.ts';
import type { HmsProvider } from './providers/hms/types.ts';
import { CashfreeVerification } from './providers/verification/cashfree.ts';
import { FakeVerification } from './providers/verification/fake.ts';
import type { VerificationProvider } from './providers/verification/types.ts';

export type Env = (key: string) => string | undefined;

export type Deps = {
  /** Service-role client: bypasses RLS. Every handler must authorise the caller itself. */
  db: SupabaseClient;
  now: () => Date;
  env: Env;
  sms: SmsProvider;
  whatsapp: WhatsAppProvider;
  push: PushProvider;
  verification: VerificationProvider;
  hms: HmsProvider;
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
    whatsapp: real ? new Msg91WhatsApp(env) : new FakeWhatsApp(),
    push: real ? new ExpoPush(env) : new FakePush(),
    verification: real ? new CashfreeVerification(env) : new FakeVerification(),
    hms: real ? new Hms100ms(env) : new FakeHms(),
  };
}
