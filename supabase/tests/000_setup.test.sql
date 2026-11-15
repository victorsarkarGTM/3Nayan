-- Runs first (alphabetical) and is NOT wrapped in a rolled-back transaction,
-- so the pgTAP extension and test helpers persist for later test files.
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Create an auth user (phone and/or email); returns its id.
create or replace function tests.create_user(p_phone text default null, p_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, p_phone,
          '{}'::jsonb, '{}'::jsonb, now(), now());
  return v_id;
end $$;

-- Act as an authenticated user for the rest of the transaction.
create or replace function tests.authenticate_as(p_user uuid, p_aal text default 'aal1')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create or replace function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

create or replace function tests.clear_auth() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select plan(1);
select pass('test setup complete');
select * from finish();
