-- Runs first (alphabetical) and is NOT wrapped in a rolled-back transaction,
-- so the pgTAP extension and test helpers persist for later test files.
create extension if not exists pgtap with schema extensions;
select plan(1);
select pass('test setup complete');
select * from finish();
