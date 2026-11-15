-- Fixes from the Milestone 0-3 independent review.

-- updated_at must advance even within one transaction (used for optimistic submit checks).
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- I3: child-row edits bump the parent application's updated_at.
create or replace function public.touch_practitioner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.practitioners set updated_at = clock_timestamp()
  where id = coalesce(new.practitioner_id, old.practitioner_id);
  return coalesce(new, old);
end $$;
create trigger touch_practitioner_categories after insert or delete on public.practitioner_categories
  for each row execute function public.touch_practitioner();
create trigger touch_practitioner_documents after insert or delete on public.practitioner_documents
  for each row execute function public.touch_practitioner();
create trigger touch_practitioner_checks after insert or update on public.verification_checks
  for each row execute function public.touch_practitioner();

-- I3: database-level content limits (the apps validate too, but direct API writes must not bypass them).
create or replace function public.http_links_only(p_links text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(l ~* '^https?://[^\s]+$'), true) from unnest(p_links) as l;
$$;
alter table public.practitioners
  add constraint practitioners_display_name_len check (display_name is null or char_length(display_name) <= 60),
  add constraint practitioners_bio_len check (bio is null or char_length(bio) <= 1500),
  add constraint practitioners_credentials_len check (credentials_text is null or char_length(credentials_text) <= 2000),
  add constraint practitioners_links_count check (cardinality(links) <= 5),
  add constraint practitioners_links_http check (public.http_links_only(links));

-- I3: submit is conditional on the snapshot's updated_at.
drop function public.apply_practitioner_transition(uuid, public.practitioner_status, public.practitioner_status,
  uuid, text, text, text, jsonb);
create function public.apply_practitioner_transition(
  p_id uuid, p_from public.practitioner_status, p_to public.practitioner_status, p_actor uuid,
  p_actor_kind text, p_action text, p_reason text, p_patch jsonb default '{}'::jsonb,
  p_expected_updated_at timestamptz default null
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.practitioners set
    status = p_to,
    assigned_reviewer_id = case when p_patch ? 'assigned_reviewer_id'
      then (p_patch ->> 'assigned_reviewer_id')::uuid else assigned_reviewer_id end,
    reapply_after = case when p_patch ? 'reapply_after'
      then (p_patch ->> 'reapply_after')::timestamptz else reapply_after end,
    submitted_at = case when p_patch ? 'submitted_at'
      then (p_patch ->> 'submitted_at')::timestamptz else submitted_at end,
    approved_at = case when p_patch ? 'approved_at'
      then (p_patch ->> 'approved_at')::timestamptz else approved_at end
  where id = p_id and status = p_from
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at);
  if not found then
    return false;
  end if;
  insert into public.practitioner_status_history (practitioner_id, from_status, to_status, action, actor_id, actor_kind, reason)
  values (p_id, p_from, p_to, p_action, p_actor, p_actor_kind, p_reason);
  insert into public.audit_log (actor_id, actor_kind, action, target_table, target_id, metadata)
  values (p_actor, p_actor_kind, 'practitioner.' || p_action, 'practitioners', p_id,
          jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason));
  return true;
end $$;
revoke execute on function public.apply_practitioner_transition(uuid, public.practitioner_status,
  public.practitioner_status, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_practitioner_transition(uuid, public.practitioner_status,
  public.practitioner_status, uuid, text, text, text, jsonb, timestamptz) to service_role;

-- I1/I2: atomic KYC attempt reservation, editable-only result writes.
alter table public.verification_checks add column pending_verification_id text unique;

create or replace function public.assert_practitioner_editable(p_practitioner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.practitioners
   where id = p_practitioner_id and status in ('draft', 'changes_requested') for update;
  if not found then raise exception 'not_editable'; end if;
end $$;

create or replace function public.reserve_kyc_attempt(p_practitioner_id uuid, p_kind text, p_now timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_recent timestamptz[];
begin
  perform public.assert_practitioner_editable(p_practitioner_id);
  insert into public.verification_checks (practitioner_id, kind) values (p_practitioner_id, p_kind)
  on conflict (practitioner_id, kind) do nothing;
  select id, array(select t from unnest(attempt_times) t where t > p_now - interval '24 hours' order by t)
    into v_id, v_recent
    from public.verification_checks where practitioner_id = p_practitioner_id and kind = p_kind for update;
  if cardinality(v_recent) >= 3 then raise exception 'kyc_attempts_exhausted'; end if;
  update public.verification_checks
     set attempt_times = v_recent || p_now, attempts = attempts + 1
   where id = v_id;
  return v_id;
end $$;

-- Undo a reservation when the provider was unavailable (the attempt must not count).
create or replace function public.release_kyc_attempt(p_check_id uuid, p_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_times timestamptz[]; v_drop timestamptz;
begin
  select attempt_times into v_times from public.verification_checks where id = p_check_id for update;
  v_drop := coalesce(p_at, (select max(t) from unnest(v_times) t));
  update public.verification_checks
     set attempt_times = array(select t from unnest(v_times) t where t is distinct from v_drop),
         attempts = greatest(attempts - 1, 0)
   where id = p_check_id and v_drop = any (attempt_times);
end $$;

create or replace function public.apply_kyc_result(
  p_check_id uuid, p_valid boolean, p_verified_name text, p_provider_ref text, p_extra jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_practitioner uuid;
begin
  select practitioner_id into v_practitioner from public.verification_checks where id = p_check_id;
  perform public.assert_practitioner_editable(v_practitioner);
  update public.verification_checks set
    status = case when p_valid then 'passed' else 'failed' end,
    verified_name = case when p_valid then p_verified_name else null end,
    provider_ref = p_provider_ref,
    masked_ref = case when p_extra ? 'masked_ref' then p_extra ->> 'masked_ref' else masked_ref end,
    year_of_birth = case when p_extra ? 'year_of_birth' then (p_extra ->> 'year_of_birth')::int else year_of_birth end,
    last_error = null,
    checked_at = clock_timestamp()
  where id = p_check_id;
end $$;

create or replace function public.store_bank_account(p_check_id uuid, p_account text, p_ifsc text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_practitioner uuid;
begin
  select practitioner_id into v_practitioner from public.verification_checks where id = p_check_id and kind = 'bank';
  if v_practitioner is null then raise exception 'bank verification check % not found', p_check_id; end if;
  perform public.assert_practitioner_editable(v_practitioner);
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_account_key';
  if v_key is null then raise exception 'bank_account_key missing from vault'; end if;
  update public.verification_checks
     set bank_account_encrypted = extensions.pgp_sym_encrypt(p_account, v_key),
         ifsc = p_ifsc, masked_ref = 'XXXX' || right(p_account, 4)
   where id = p_check_id;
end $$;

create or replace function public.store_pan(p_check_id uuid, p_pan text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text; v_practitioner uuid;
begin
  select practitioner_id into v_practitioner from public.verification_checks where id = p_check_id and kind = 'pan';
  if v_practitioner is null then raise exception 'pan verification check % not found', p_check_id; end if;
  perform public.assert_practitioner_editable(v_practitioner);
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_account_key';
  if v_key is null then raise exception 'bank_account_key missing from vault'; end if;
  update public.verification_checks
     set pan_encrypted = extensions.pgp_sym_encrypt(p_pan, v_key),
         masked_ref = left(p_pan, 2) || 'XXXXXX' || right(p_pan, 2)
   where id = p_check_id;
end $$;

revoke execute on function public.assert_practitioner_editable(uuid), public.reserve_kyc_attempt(uuid, text, timestamptz),
  public.release_kyc_attempt(uuid, timestamptz), public.apply_kyc_result(uuid, boolean, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.assert_practitioner_editable(uuid), public.reserve_kyc_attempt(uuid, text, timestamptz),
  public.release_kyc_attempt(uuid, timestamptz), public.apply_kyc_result(uuid, boolean, text, text, jsonb)
  to service_role;

-- I4: at most one open trial per practitioner.  I8: reviewer notes live in review_notes only.
create unique index trial_calls_one_open on public.trial_calls (practitioner_id) where status in ('proposed', 'scheduled');
alter table public.trial_calls drop column notes;

-- I6: Razorpay provisioning progress, so retries resume instead of repeating steps.
alter table public.practitioners
  add column razorpay_stakeholder_id text,
  add column razorpay_product_id text,
  add column razorpay_settlement_configured boolean not null default false;

create or replace function public.guard_practitioner_write() returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.assigned_reviewer_id is not null or new.reapply_after is not null
       or new.razorpay_account_id is not null or new.razorpay_account_status is not null
       or new.razorpay_stakeholder_id is not null or new.razorpay_product_id is not null
       or new.razorpay_settlement_configured or new.submitted_at is not null or new.approved_at is not null then
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
     or new.razorpay_stakeholder_id is distinct from old.razorpay_stakeholder_id
     or new.razorpay_product_id is distinct from old.razorpay_product_id
     or new.razorpay_settlement_configured is distinct from old.razorpay_settlement_configured
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at
     or new.user_id is distinct from old.user_id then
    raise exception 'protected practitioner columns cannot be changed by clients' using errcode = '42501';
  end if;
  return new;
end $$;
