begin;
select plan(2);
select tests.create_user('919999900711') as a \gset
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
select tests.authenticate_as(:'a');
select throws_ok(format($q$update public.practitioners set links = '{javascript:alert(1)}' where id = %L$q$, :'p'),
  '23514', null, 'non-http links are rejected by the database');
select throws_ok(format('update public.practitioners set bio = %L where id = %L', repeat('x', 1501), :'p'),
  '23514', null, 'bio over 1500 chars is rejected by the database');
select * from finish();
rollback;
