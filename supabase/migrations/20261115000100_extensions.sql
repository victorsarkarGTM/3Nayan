-- Core extensions used across 3Nayan.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
