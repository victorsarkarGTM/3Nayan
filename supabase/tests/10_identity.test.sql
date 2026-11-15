begin;
select plan(8);

select tests.create_user('919999900101') as a \gset
select tests.create_user('919999900102') as b \gset
select tests.create_user(null, 'reviewer@3nayan.test') as r \gset
insert into public.staff (user_id, email, role) values (:'r', 'reviewer@3nayan.test', 'reviewer');

select is((select phone from public.profiles where id = :'a'), '+919999900101',
  'new auth user with phone creates profile');

select tests.authenticate_as(:'a');
select is_empty(format('select 1 from public.profiles where id = %L', :'b'), 'user A cannot select user B profile');
select throws_ok(format('update public.profiles set phone = %L where id = %L', '+910000000000', :'a'),
  '42501', null, 'user cannot update own profile phone');
select lives_ok(format('update public.profiles set full_name = %L where id = %L', 'Asha', :'a'),
  'user can update own full_name');
select throws_ok($$insert into public.audit_log (actor_kind, action) values ('user', 'x')$$,
  '42501', null, 'authenticated cannot insert audit_log');

select tests.authenticate_as(:'r', 'aal1');
select is(public.is_staff(), false, 'staff row without aal2 → is_staff() false');

select tests.authenticate_as(:'r', 'aal2');
select ok(public.is_staff('{reviewer}') and not public.is_staff('{super_admin}'),
  'reviewer with aal2 → is_staff(reviewer) true and is_staff(super_admin) false');
select is_empty('select 1 from public.audit_log', 'reviewer cannot select audit_log');

select * from finish();
rollback;
