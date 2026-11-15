-- Trial calls, call events, push tokens, notifications log, attention queue, deletion requests, storage.

create type public.trial_status as enum ('proposed', 'scheduled', 'completed', 'missed', 'expired', 'cancelled');

create table public.trial_calls (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id),
  proposed_slots timestamptz[] not null default '{}',
  proposed_at timestamptz,
  scheduled_at timestamptz,
  status public.trial_status not null default 'proposed',
  hms_room_id text,
  reschedule_used boolean not null default false,
  pick_reminder_sent boolean not null default false,
  hour_reminder_sent boolean not null default false,
  notes text,
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trial_calls_practitioner_idx on public.trial_calls (practitioner_id, created_at desc);
create index trial_calls_status_idx on public.trial_calls (status, scheduled_at);
create trigger trial_calls_updated_at before update on public.trial_calls
  for each row execute function public.set_updated_at();
alter table public.trial_calls enable row level security;
revoke insert, update, delete on public.trial_calls from anon, authenticated;
create policy trial_calls_read on public.trial_calls for select to authenticated
  using (public.owns_practitioner(practitioner_id) or public.is_staff());

create table public.call_events (
  id uuid primary key default gen_random_uuid(),
  call_kind text not null check (call_kind in ('trial', 'session')),
  call_id uuid not null,
  user_id uuid,
  event text not null check (event in ('join', 'leave')),
  at timestamptz not null,
  created_at timestamptz not null default now()
);
create index call_events_call_idx on public.call_events (call_kind, call_id, at);
alter table public.call_events enable row level security;
revoke insert, update, delete on public.call_events from anon, authenticated;
create policy call_events_read on public.call_events for select to authenticated using (public.is_staff());

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
revoke update on public.device_tokens from anon, authenticated;
create policy device_tokens_select on public.device_tokens for select to authenticated using (user_id = auth.uid());
create policy device_tokens_insert on public.device_tokens for insert to authenticated with check (user_id = auth.uid());
create policy device_tokens_delete on public.device_tokens for delete to authenticated using (user_id = auth.uid());

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_key text not null,
  channel text not null check (channel in ('sms', 'whatsapp', 'push')),
  status text not null check (status in ('sent', 'failed')),
  data jsonb not null default '{}'::jsonb,
  provider_ref text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_failed_idx on public.notifications (status, created_at) where status = 'failed';
create trigger notifications_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();
alter table public.notifications enable row level security;
revoke insert, update, delete on public.notifications from anon, authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

create table public.attention_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  target_id uuid,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attention_open_idx on public.attention_items (status, kind, created_at);
create trigger attention_items_updated_at before update on public.attention_items
  for each row execute function public.set_updated_at();
alter table public.attention_items enable row level security;
revoke insert, update, delete on public.attention_items from anon, authenticated;
grant update (status, resolved_by, resolved_at) on public.attention_items to authenticated;
create policy attention_read on public.attention_items for select to authenticated
  using (public.is_staff('{finance,support,super_admin}'));
create policy attention_update on public.attention_items for update to authenticated
  using (public.is_staff('{finance,support,super_admin}'))
  with check (public.is_staff('{finance,support,super_admin}'));

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index deletion_requests_one_pending on public.deletion_requests (user_id) where status = 'pending';
alter table public.deletion_requests enable row level security;
revoke insert, update, delete on public.deletion_requests from anon, authenticated;
create policy deletion_requests_read on public.deletion_requests for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png']),
  ('practitioner-private', 'practitioner-private', false, 104857600,
   array['application/pdf', 'image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_write_practitioner_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.practitioners p
    where p.id::text = (storage.foldername(p_name))[1]
      and p.user_id = auth.uid()
      and p.status in ('draft', 'changes_requested')
  );
$$;
grant execute on function public.can_write_practitioner_object(text) to authenticated;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- practitioner-private: owners may upload (and remove) while editable; nobody but the service role reads.
create policy pp_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'practitioner-private' and public.can_write_practitioner_object(name));
create policy pp_delete on storage.objects for delete to authenticated
  using (bucket_id = 'practitioner-private' and public.can_write_practitioner_object(name));
