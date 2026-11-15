begin;
select plan(9);

select tests.create_user('919999900301') as a \gset
select tests.create_user(null, 'rev3@3nayan.test') as r \gset
insert into public.staff (user_id, email, role) values (:'r', 'rev3@3nayan.test', 'reviewer');
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
insert into public.verification_checks (practitioner_id, kind, status, verified_name)
  values (:'p', 'bank', 'passed', 'ASHA RAO') returning id as chk \gset

-- Bank account encryption (service role only).
select tests.as_service();
select lives_ok(format('select public.store_bank_account(%L, %L, %L)', :'chk', '123456783210', 'HDFC0001234'),
  'service role stores bank account');
select is((select masked_ref from public.verification_checks where id = :'chk'), 'XXXX3210',
  'store_bank_account sets masked_ref XXXX3210');
select is(public.reveal_bank_account(:'chk'), '123456783210', 'reveal returns the original account number');

select tests.authenticate_as(:'a');
select throws_ok(format('select public.store_bank_account(%L, %L, %L)', :'chk', '1', 'X'),
  '42501', null, 'authenticated cannot execute store_bank_account');
select is((select masked_ref from public.my_verification_checks where kind = 'bank'), 'XXXX3210',
  'owner sees own row in my_verification_checks');
select is_empty('select 1 from public.verification_checks', 'owner cannot select verification_checks table');
select hasnt_column('public', 'my_verification_checks', 'bank_account_encrypted',
  'view never exposes the encrypted account');

-- Atomic, stale-safe transitions.
select tests.as_service();
select results_eq(
  format($q$select public.apply_practitioner_transition(%L, 'draft', 'submitted', %L, 'user', 'submit', null, '{}'::jsonb)
         union all
         select public.apply_practitioner_transition(%L, 'draft', 'submitted', %L, 'user', 'submit', null, '{}'::jsonb)$q$,
         :'p', :'a', :'p', :'a'),
  $$values (true), (false)$$,
  'transition returns true once and false on a stale second call');
select ok(
  (select count(*) from public.practitioner_status_history where practitioner_id = :'p') = 1
  and (select count(*) from public.audit_log where target_id = :'p' and action = 'practitioner.submit') = 1,
  'transition writes exactly one history and one audit row');

select * from finish();
rollback;
