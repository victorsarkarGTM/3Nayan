begin;
select plan(2);
select tests.create_user(null, 'own7@3nayan.test') as s \gset
select tests.create_user(null, 'other7@3nayan.test') as o \gset
insert into public.staff (user_id, email, role) values (:'s', 'own7@3nayan.test', 'reviewer'), (:'o', 'other7@3nayan.test', 'support');
select tests.authenticate_as(:'s', 'aal1');
select is((select count(*)::int from public.staff), 1, 'staff without MFA can read only their own staff row');
select is((select role::text from public.staff where user_id = :'s'), 'reviewer', 'own role is visible');
select * from finish();
rollback;
