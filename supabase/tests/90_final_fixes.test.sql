begin;
select plan(6);
select tests.create_user('919999900901') as a \gset
select tests.create_user('919999900902') as b \gset
select tests.create_user(null, 'boss9@3nayan.test') as s \gset
insert into public.staff (user_id, email, role) values (:'s', 'boss9@3nayan.test', 'super_admin');

-- C2: device tokens register through an RPC; a token moves to whoever registers it last.
select tests.authenticate_as(:'a');
select lives_ok($$select public.register_device_token('ExponentPushToken[shared]', 'android')$$, 'user A registers a token');
select tests.authenticate_as(:'b');
select lives_ok($$select public.register_device_token('ExponentPushToken[shared]', 'android')$$, 'user B registers the same token');
select tests.clear_auth();
select is((select user_id from public.device_tokens where expo_token = 'ExponentPushToken[shared]'), :'b'::uuid, 'token now belongs to B');
select tests.authenticate_as(:'b');
select public.unregister_device_token('ExponentPushToken[shared]');
select tests.clear_auth();
select is_empty($$select 1 from public.device_tokens where expo_token = 'ExponentPushToken[shared]'$$, 'unregister removes it');

-- I5: settings and staff changes are audited with the acting staff member.
select tests.authenticate_as(:'s', 'aal2');
update public.platform_settings set value = '{"bps": 1500}' where key = 'commission_rate';
update public.staff set role = 'reviewer' where user_id = :'s';
select tests.clear_auth();
select is((select actor_id from public.audit_log where action = 'settings.update' order by created_at desc limit 1), :'s'::uuid, 'settings change audited with actor');
select ok(exists (select 1 from public.audit_log where action = 'staff.update' and target_id = :'s'), 'staff change audited');
select * from finish();
rollback;
