-- Categories and practitioner applications.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
alter table public.categories enable row level security;
create policy categories_read on public.categories for select to anon, authenticated
  using (active or public.is_staff());
create policy categories_write on public.categories for all to authenticated
  using (public.is_staff('{super_admin}')) with check (public.is_staff('{super_admin}'));

create type public.practitioner_status as enum
  ('draft', 'submitted', 'in_review', 'changes_requested', 'trial_scheduled', 'approved', 'rejected', 'suspended');

create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  photo_path text,
  bio text,
  years_experience int check (years_experience between 0 and 60),
  languages text[] not null default '{}',
  offers_online boolean not null default false,
  offers_in_person boolean not null default false,
  address_full text,
  city text,
  pincode text,
  lat double precision,
  lng double precision,
  location extensions.geography(point, 4326) generated always as (
    case when lat is null or lng is null then null
         else extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end
  ) stored,
  credentials_text text,
  links text[] not null default '{}',
  video_path text,
  video_duration_seconds numeric,
  video_bytes bigint,
  video_mime text,
  email text,
  residential_address jsonb,
  gstin text,
  agreement_version text,
  declaration_accepted boolean not null default false,
  status public.practitioner_status not null default 'draft',
  assigned_reviewer_id uuid references auth.users (id),
  reapply_after timestamptz,
  razorpay_account_id text,
  razorpay_account_status text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practitioners_status_idx on public.practitioners (status, submitted_at);
create trigger practitioners_updated_at before update on public.practitioners
  for each row execute function public.set_updated_at();
alter table public.practitioners enable row level security;

-- Clients (anon/authenticated) may never set workflow or payout columns, and may only edit while the
-- application is editable. The service role (Edge Functions) and migrations are unrestricted.
create or replace function public.guard_practitioner_write() returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.assigned_reviewer_id is not null or new.reapply_after is not null
       or new.razorpay_account_id is not null or new.razorpay_account_status is not null
       or new.submitted_at is not null or new.approved_at is not null then
      raise exception 'protected practitioner columns cannot be set by clients' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status not in ('draft', 'changes_requested') then
    raise exception 'application is not editable in status %', old.status using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     or new.assigned_reviewer_id is distinct from old.assigned_reviewer_id
     or new.reapply_after is distinct from old.reapply_after
     or new.razorpay_account_id is distinct from old.razorpay_account_id
     or new.razorpay_account_status is distinct from old.razorpay_account_status
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.user_id is distinct from old.user_id then
    raise exception 'protected practitioner columns cannot be changed by clients' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_practitioner_write before insert or update on public.practitioners
  for each row execute function public.guard_practitioner_write();

revoke delete on public.practitioners from anon, authenticated;
create policy practitioners_select on public.practitioners for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy practitioners_insert_own on public.practitioners for insert to authenticated
  with check (user_id = auth.uid());
create policy practitioners_update_own on public.practitioners for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- True when the caller owns this practitioner row and it is editable.
create or replace function public.owns_editable_practitioner(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.practitioners p
    where p.id = p_id and p.user_id = auth.uid() and p.status in ('draft', 'changes_requested')
  );
$$;
create or replace function public.owns_practitioner(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.practitioners p where p.id = p_id and p.user_id = auth.uid());
$$;
grant execute on function public.owns_editable_practitioner(uuid), public.owns_practitioner(uuid) to authenticated;

create table public.practitioner_categories (
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (practitioner_id, category_id)
);
alter table public.practitioner_categories enable row level security;
revoke update on public.practitioner_categories from anon, authenticated;
create policy pc_select on public.practitioner_categories for select to authenticated
  using (public.owns_practitioner(practitioner_id) or public.is_staff());
create policy pc_insert on public.practitioner_categories for insert to authenticated
  with check (public.owns_editable_practitioner(practitioner_id));
create policy pc_delete on public.practitioner_categories for delete to authenticated
  using (public.owns_editable_practitioner(practitioner_id));

create table public.practitioner_documents (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  kind text not null check (kind in ('certificate')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practitioner_documents_practitioner_idx on public.practitioner_documents (practitioner_id);
create trigger practitioner_documents_updated_at before update on public.practitioner_documents
  for each row execute function public.set_updated_at();
alter table public.practitioner_documents enable row level security;
revoke update on public.practitioner_documents from anon, authenticated;
create policy pd_select on public.practitioner_documents for select to authenticated
  using (public.owns_practitioner(practitioner_id) or public.is_staff());
create policy pd_insert on public.practitioner_documents for insert to authenticated
  with check (public.owns_editable_practitioner(practitioner_id));
create policy pd_delete on public.practitioner_documents for delete to authenticated
  using (public.owns_editable_practitioner(practitioner_id));
