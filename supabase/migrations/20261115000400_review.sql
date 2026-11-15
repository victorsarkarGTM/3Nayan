-- KYC verification results, status history, internal review notes, atomic transitions.

create table public.verification_checks (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  kind text not null check (kind in ('pan', 'aadhaar', 'bank')),
  status text not null default 'pending' check (status in ('pending', 'passed', 'flagged', 'failed')),
  verified_name text,
  name_match_score numeric(4, 3),
  masked_ref text,
  provider_ref text,
  year_of_birth int,
  bank_account_encrypted bytea,
  ifsc text,
  attempts int not null default 0,
  attempt_times timestamptz[] not null default '{}',
  last_error text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practitioner_id, kind)
);
create trigger verification_checks_updated_at before update on public.verification_checks
  for each row execute function public.set_updated_at();
alter table public.verification_checks enable row level security;
revoke insert, update, delete on public.verification_checks from anon, authenticated;
-- No owner policy on the table: owners read the masked view below. Staff read the table.
create policy vc_staff_read on public.verification_checks for select to authenticated using (public.is_staff());

-- Owner-facing view: runs as its owner and filters to the caller's own practitioner; never exposes
-- the encrypted account number or provider references.
create view public.my_verification_checks as
  select vc.kind, vc.status, vc.verified_name, vc.name_match_score, vc.masked_ref, vc.attempts,
         vc.attempt_times, vc.checked_at
  from public.verification_checks vc
  join public.practitioners p on p.id = vc.practitioner_id
  where p.user_id = auth.uid();
revoke all on public.my_verification_checks from anon;
grant select on public.my_verification_checks to authenticated;

-- Encryption key lives in Supabase Vault; created once per environment.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bank_account_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bank_account_key',
      'Symmetric key for practitioner bank account numbers');
  end if;
end $$;

create or replace function public.store_bank_account(p_check_id uuid, p_account text, p_ifsc text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_account_key';
  if v_key is null then raise exception 'bank_account_key missing from vault'; end if;
  update public.verification_checks
     set bank_account_encrypted = extensions.pgp_sym_encrypt(p_account, v_key),
         ifsc = p_ifsc,
         masked_ref = 'XXXX' || right(p_account, 4)
   where id = p_check_id and kind = 'bank';
  if not found then raise exception 'bank verification check % not found', p_check_id; end if;
end $$;

create or replace function public.reveal_bank_account(p_check_id uuid) returns text
language sql security definer set search_path = '' as $$
  select extensions.pgp_sym_decrypt(vc.bank_account_encrypted,
           (select decrypted_secret from vault.decrypted_secrets where name = 'bank_account_key'))
  from public.verification_checks vc where vc.id = p_check_id;
$$;

revoke execute on function public.store_bank_account(uuid, text, text), public.reveal_bank_account(uuid)
  from public, anon, authenticated;
grant execute on function public.store_bank_account(uuid, text, text), public.reveal_bank_account(uuid)
  to service_role;

-- Status history ------------------------------------------------------------
create table public.practitioner_status_history (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  from_status public.practitioner_status not null,
  to_status public.practitioner_status not null,
  action text not null,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('staff', 'system', 'user')),
  reason text,
  created_at timestamptz not null default now()
);
create index psh_practitioner_idx on public.practitioner_status_history (practitioner_id, created_at desc);
alter table public.practitioner_status_history enable row level security;
revoke insert, update, delete on public.practitioner_status_history from anon, authenticated;
-- Applicants see their own history (it carries change-request and rejection reasons meant for them).
create policy psh_read on public.practitioner_status_history for select to authenticated
  using (public.owns_practitioner(practitioner_id) or public.is_staff());

-- Internal notes (never shown to applicants) ----------------------------------
create table public.review_notes (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners (id) on delete cascade,
  staff_id uuid not null references auth.users (id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index review_notes_practitioner_idx on public.review_notes (practitioner_id, created_at desc);
alter table public.review_notes enable row level security;
revoke update, delete on public.review_notes from anon, authenticated;
create policy rn_read on public.review_notes for select to authenticated
  using (public.is_staff('{reviewer,super_admin,support}'));
create policy rn_insert on public.review_notes for insert to authenticated
  with check (staff_id = auth.uid() and public.is_staff('{reviewer,super_admin,support}'));

-- Atomic transition: conditional update on the expected status + history + audit, in one statement.
create or replace function public.apply_practitioner_transition(
  p_id uuid, p_from public.practitioner_status, p_to public.practitioner_status, p_actor uuid,
  p_actor_kind text, p_action text, p_reason text, p_patch jsonb default '{}'::jsonb
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
  where id = p_id and status = p_from;
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
  public.practitioner_status, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_practitioner_transition(uuid, public.practitioner_status,
  public.practitioner_status, uuid, text, text, text, jsonb) to service_role;
