import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { configureFunctionsUrl } from '@3nayan/client';
import type { Database } from '@3nayan/db';
import { ChunkedSecureStore } from './secure-storage';

export const supabase: SupabaseClient<Database> = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ChunkedSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);
configureFunctionsUrl(process.env.EXPO_PUBLIC_FUNCTIONS_URL ?? null);

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
