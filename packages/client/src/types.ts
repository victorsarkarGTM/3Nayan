import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@3nayan/db';

export type Sb = SupabaseClient<Database>;
export type Tables = Database['public']['Tables'];
export type PractitionerDbRow = Tables['practitioners']['Row'];
