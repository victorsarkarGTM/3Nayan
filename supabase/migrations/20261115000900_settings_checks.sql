-- Platform settings must hold valid values even when written directly through the API.
create or replace function public.validate_platform_setting() returns trigger language plpgsql as $$
begin
  if new.key = 'commission_rate' then
    if jsonb_typeof(new.value -> 'bps') <> 'number' or (new.value ->> 'bps')::numeric not between 0 and 5000
       or (new.value ->> 'bps')::numeric <> trunc((new.value ->> 'bps')::numeric) then
      raise exception 'commission_rate.bps must be a whole number between 0 and 5000' using errcode = '23514';
    end if;
  elsif new.key = 'legal_versions' then
    if exists (
      select 1 from unnest(array['terms', 'privacy', 'practitioner_agreement']) as k
      where coalesce(new.value ->> k, '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'
    ) then
      raise exception 'legal_versions needs terms, privacy and practitioner_agreement versions' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger validate_platform_setting before insert or update on public.platform_settings
  for each row execute function public.validate_platform_setting();
