begin;
select plan(10);

select tests.create_user('919999900401') as a \gset
select tests.create_user('919999900402') as b \gset
select tests.create_user(null, 'rev4@3nayan.test') as r \gset
select tests.create_user(null, 'sup4@3nayan.test') as s \gset
insert into public.staff (user_id, email, role) values (:'r', 'rev4@3nayan.test', 'reviewer'), (:'s', 'sup4@3nayan.test', 'support');
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
insert into public.practitioners (user_id, display_name) values (:'b', 'Bina') returning id as pb \gset
insert into public.trial_calls (practitioner_id, reviewer_id, proposed_slots, proposed_at, status)
  values (:'p', :'r', array[now() + interval '2 days'], now(), 'proposed');
insert into public.attention_items (kind, target_id, error) values ('linked_account_failed', :'p', 'boom')
  returning id as att \gset

select tests.authenticate_as(:'a');
select isnt_empty('select 1 from public.trial_calls', 'owner can read own trial_calls');
select throws_ok(format($q$insert into public.trial_calls (practitioner_id, reviewer_id, status) values (%L, %L, 'proposed')$q$, :'p', :'r'),
  '42501', null, 'authenticated cannot insert trial_calls');
select lives_ok(format($q$insert into storage.objects (bucket_id, name, owner) values ('practitioner-private', %L, %L)$q$,
  :'p' || '/certificate/a.pdf', :'a'), 'owner can insert under own practitioner folder in draft');
select throws_ok(format($q$insert into storage.objects (bucket_id, name, owner) values ('practitioner-private', %L, %L)$q$,
  :'pb' || '/certificate/x.pdf', :'a'), '42501', null, 'owner cannot insert under another practitioner folder');
select is_empty($$select 1 from storage.objects where bucket_id = 'practitioner-private'$$,
  'owner cannot select storage.objects in practitioner-private');

select tests.authenticate_as(:'b');
select is_empty('select 1 from public.trial_calls', 'user B cannot read A''s trial_calls');

select tests.clear_auth();
select is((select file_size_limit from storage.buckets where id = 'practitioner-private'), 104857600::bigint,
  'bucket practitioner-private file_size_limit = 104857600');

select tests.authenticate_as(:'s', 'aal2');
select lives_ok(format($q$update public.attention_items set status = 'resolved', resolved_by = %L where id = %L$q$, :'s', :'att'),
  'support can update attention_items.status');
select is((select status from public.attention_items where id = :'att'), 'resolved', 'update took effect');

select tests.authenticate_as(:'r', 'aal2');
select is_empty('select 1 from public.attention_items', 'reviewer cannot read attention_items');

select * from finish();
rollback;
