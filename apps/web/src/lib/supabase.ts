import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@3nayan/db';
import { configureFunctionsUrl } from '@3nayan/client';

let client: SupabaseClient<Database> | null = null;

/** Browser Supabase client (session in cookies so the proxy can read it). */
export function supabase(): SupabaseClient<Database> {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    configureFunctionsUrl(process.env.NEXT_PUBLIC_FUNCTIONS_URL ?? null);
  }
  return client;
}
