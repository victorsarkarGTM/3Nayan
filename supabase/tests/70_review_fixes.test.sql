begin;
select plan(10);

select tests.create_user('919999900701') as a \gset
select tests.create_user(null, 'rev70@3nayan.test') as r \gset
insert into public.staff (user_id, email, role) values (:'r', 'rev70@3nayan.test', 'reviewer');
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
select id as cat from public.categories where parent_id is not null limit 1 \gset

select tests.as_service();
-- I1: attempt reservation is atomic and capped at 3 per 24h.
select ok(public.reserve_kyc_attempt(:'p', 'pan', now()) is not null, 'reserve 1');
select ok(public.reserve_kyc_attempt(:'p', 'pan', now()) is not null, 'reserve 2');
select public.reserve_kyc_attempt(:'p', 'pan', now()) as chk \gset
select throws_ok(format('select public.reserve_kyc_attempt(%L, %L, now())', :'p', 'pan'), 'P0001', 'kyc_attempts_exhausted',
  '4th reservation in 24h is refused');
select lives_ok(format('select public.release_kyc_attempt(%L)', :'chk'), 'release frees one slot');
select ok(public.reserve_kyc_attempt(:'p', 'pan', now()) is not null, 'slot is reusable after release');

-- I3: submit is conditional on the snapshot's updated_at; child-row edits bump it.
select updated_at as before from public.practitioners where id = :'p' \gset
select pg_sleep(0.01);
select tests.authenticate_as(:'a');
insert into public.practitioner_categories (practitioner_id, category_id) values (:'p', :'cat');
select tests.as_service();
select ok((select updated_at from public.practitioners where id = :'p') > :'before'::timestamptz,
  'adding a category bumps practitioners.updated_at');
select is(public.apply_practitioner_transition(:'p', 'draft', 'submitted', :'a', 'user', 'submit', null, '{}'::jsonb, :'before'::timestamptz),
  false, 'transition with a stale expected updated_at is refused');

-- I2: KYC writes require an editable application.
update public.practitioners set status = 'submitted' where id = :'p';
insert into public.verification_checks (practitioner_id, kind) values (:'p', 'bank') returning id as bank \gset
select throws_ok(format('select public.store_bank_account(%L, %L, %L)', :'bank', '123456789012', 'HDFC0001234'),
  'P0001', 'not_editable', 'bank account cannot be stored once submitted');

-- I4: at most one open trial per practitioner.
insert into public.trial_calls (practitioner_id, reviewer_id, status) values (:'p', :'r', 'proposed');
select throws_ok(format($q$insert into public.trial_calls (practitioner_id, reviewer_id, status) values (%L, %L, 'proposed')$q$, :'p', :'r'),
  '23505', null, 'second open trial is rejected');

-- I8: trial notes are not stored on the applicant-readable table.
select hasnt_column('public', 'trial_calls', 'notes', 'trial_calls has no notes column');

select * from finish();
rollback;
