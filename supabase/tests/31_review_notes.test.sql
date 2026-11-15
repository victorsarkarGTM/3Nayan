begin;
select plan(1);
select tests.create_user('919999900311') as a \gset
insert into public.practitioners (user_id, display_name) values (:'a', 'Asha') returning id as p \gset
insert into public.review_notes (practitioner_id, staff_id, body) values (:'p', :'a', 'internal');
select tests.authenticate_as(:'a');
select is_empty('select 1 from public.review_notes', 'owner cannot read review_notes');
select * from finish();
rollback;
