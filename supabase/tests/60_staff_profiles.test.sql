begin;
select plan(2);
select tests.create_user('919999900601') as a \gset
select tests.create_user('919999900602') as b \gset
select tests.create_user(null, 'sup6@3nayan.test') as s \gset
insert into public.staff (user_id, email, role) values (:'s', 'sup6@3nayan.test', 'support');
select tests.authenticate_as(:'s', 'aal2');
select isnt_empty(format('select 1 from public.profiles where id = %L', :'a'), 'staff (aal2) can read applicant profiles');
select tests.authenticate_as(:'b');
select is_empty(format('select 1 from public.profiles where id = %L', :'a'), 'non-staff still cannot read other profiles');
select * from finish();
rollback;
