begin;
select plan(3);
select tests.create_user('919999900321') as a \gset
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
insert into public.verification_checks (practitioner_id, kind) values (:'p', 'pan') returning id as chk \gset
select tests.as_service();
select lives_ok(format('select public.store_pan(%L, %L)', :'chk', 'ABCDE1234F'), 'service role stores PAN encrypted');
select is(public.reveal_pan(:'chk'), 'ABCDE1234F', 'reveal_pan returns the PAN');
select tests.authenticate_as(:'a');
select throws_ok(format('select public.reveal_pan(%L)', :'chk'), '42501', null, 'authenticated cannot reveal PAN');
select * from finish();
rollback;
