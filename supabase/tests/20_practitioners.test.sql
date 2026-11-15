begin;
select plan(11);

select tests.create_user('919999900201') as a \gset
select tests.create_user('919999900202') as b \gset
select tests.create_user(null, 'rev2@3nayan.test') as r \gset
insert into public.staff (user_id, email, role) values (:'r', 'rev2@3nayan.test', 'reviewer');
select id as cat from public.categories where parent_id is not null and active limit 1 \gset

select tests.authenticate_as(:'a');
select lives_ok(format('insert into public.practitioners (user_id, display_name) values (%L, %L)', :'a', 'Asha'),
  'owner can insert own draft');
select throws_ok(format('insert into public.practitioners (user_id, display_name) values (%L, %L)', :'b', 'Fake'),
  '42501', null, 'owner cannot insert for another user_id');
select throws_ok(format('insert into public.practitioners (user_id, display_name, status) values (%L, %L, %L)', :'b', 'B', 'approved'),
  '42501', null, 'client cannot insert a non-draft practitioner');
select id as p from public.practitioners where user_id = :'a' \gset

select throws_ok(format('update public.practitioners set status = %L where id = %L', 'approved', :'p'),
  '42501', null, 'practitioner_column_guard: owner update of status throws');
select lives_ok(format('insert into public.practitioner_categories (practitioner_id, category_id) values (%L, %L)', :'p', :'cat'),
  'owner can add category while draft');

-- Move to submitted as service role (as the submit function would).
select tests.as_service();
update public.practitioners set status = 'submitted' where id = :'p';

select tests.authenticate_as(:'a');
select throws_ok(format('update public.practitioners set bio = %L where id = %L', 'new bio', :'p'),
  '42501', null, 'practitioner_column_guard: owner update of bio while submitted throws');
select throws_ok(format($q$insert into public.practitioner_documents (practitioner_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (%L, 'certificate', 'x/certificate/a.pdf', 'a.pdf', 'application/pdf', 100)$q$, :'p'),
  '42501', null, 'owner cannot add document when status submitted');

select tests.as_service();
update public.practitioners set status = 'changes_requested' where id = :'p';
select tests.authenticate_as(:'a');
select lives_ok(format('update public.practitioners set bio = %L where id = %L', 'updated bio', :'p'),
  'owner update of bio while changes_requested succeeds');

select tests.authenticate_as(:'b');
select is_empty(format('select 1 from public.practitioners where id = %L', :'p'), 'user B cannot read user A practitioner');

select tests.authenticate_as(:'r', 'aal2');
select isnt_empty(format('select 1 from public.practitioners where id = %L', :'p'), 'reviewer (aal2) reads all');

select tests.clear_auth();
update public.categories set active = false where id = :'cat';
select tests.as_anon();
select ok((select count(*) from public.categories) > 0
          and not exists (select 1 from public.categories where id = :'cat'),
  'anon reads active categories, not inactive');

select * from finish();
rollback;
