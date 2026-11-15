-- Platform defaults (local + CI). Staging/production set these via the admin panel.
insert into public.platform_settings (key, value) values
  ('commission_rate', '{"bps": 2000}'),
  ('legal_versions', '{"terms": "draft-1", "privacy": "draft-1", "practitioner_agreement": "draft-1"}')
on conflict (key) do nothing;
