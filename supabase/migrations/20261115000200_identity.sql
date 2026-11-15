-- Identity core: profiles, consents, staff, platform settings, audit log.

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create type public.staff_role as enum ('reviewer', 'support', 'finance', 'super_admin');

-- Profiles -----------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text check (full_name is null or char_length(full_name) between 1 and 120),
  photo_path text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
alter table public.profiles enable row level security;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, photo_path) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null and new.phone <> '' then
    insert into public.profiles (id, phone)
    values (new.id, case when left(new.phone, 1) = '+' then new.phone else '+' || new.phone end)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Consents -----------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'practitioner_agreement')),
  version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document, version)
);
create index consents_user_idx on public.consents (user_id);
create trigger consents_updated_at before update on public.consents
  for each row execute function public.set_updated_at();
alter table public.consents enable row level security;
revoke update, delete on public.consents from anon, authenticated;
create policy consents_select_own on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = auth.uid());

-- Staff --------------------------------------------------------------------
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();
alter table public.staff enable row level security;

-- True when the caller is active staff (optionally in one of `roles`) AND signed in with MFA (aal2).
create or replace function public.is_staff(roles public.staff_role[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.staff s
       where s.user_id = auth.uid() and s.active and (roles is null or s.role = any (roles))
     );
$$;
grant execute on function public.is_staff(public.staff_role[]) to authenticated;

create policy staff_select on public.staff for select to authenticated using (public.is_staff());
create policy staff_write on public.staff for all to authenticated
  using (public.is_staff('{super_admin}')) with check (public.is_staff('{super_admin}'));

-- Platform settings --------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select to authenticated using (true);
create policy settings_write on public.platform_settings for all to authenticated
  using (public.is_staff('{super_admin}')) with check (public.is_staff('{super_admin}'));

-- Audit log ----------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('staff', 'system', 'user')),
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_target_idx on public.audit_log (target_table, target_id);
alter table public.audit_log enable row level security;
revoke insert, update, delete on public.audit_log from anon, authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.is_staff('{super_admin}'));

create or replace function public.write_audit(
  p_actor_id uuid, p_actor_kind text, p_action text, p_target_table text, p_target_id uuid, p_metadata jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_kind, action, target_table, target_id, metadata)
  values (p_actor_id, p_actor_kind, p_action, p_target_table, p_target_id, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke execute on function public.write_audit(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_audit(uuid, text, text, text, uuid, jsonb) to service_role;
