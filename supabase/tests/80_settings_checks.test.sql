begin;
select plan(3);
select throws_ok($$update public.platform_settings set value = '{"bps": 5001}' where key = 'commission_rate'$$, '23514', null,
  'commission above 50% is rejected');
select lives_ok($$update public.platform_settings set value = '{"bps": 1500}' where key = 'commission_rate'$$, 'commission of 15% is accepted');
select throws_ok($$update public.platform_settings set value = '{"terms": "", "privacy": "v1", "practitioner_agreement": "v1"}' where key = 'legal_versions'$$,
  '23514', null, 'empty legal version is rejected');
select * from finish();
rollback;
