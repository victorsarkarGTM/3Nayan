begin;
select plan(5);
select has_extension('pgcrypto');
select has_extension('postgis');
select has_extension('pg_cron');
select has_extension('pg_net');
select has_extension('supabase_vault');
select * from finish();
rollback;
