-- Final review fixes.

-- C2: device tokens are registered through RPCs (a token moves to whoever signs in on that device).
create or replace function public.register_device_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_platform not in ('ios', 'android', 'web') or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  insert into public.device_tokens (user_id, expo_token, platform, last_seen_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (expo_token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

create or replace function public.unregister_device_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.device_tokens where expo_token = p_token and user_id = auth.uid();
$$;
revoke execute on function public.register_device_token(text, text), public.unregister_device_token(text) from public, anon;
grant execute on function public.register_device_token(text, text), public.unregister_device_token(text) to authenticated;

-- I5: audit configuration changes made directly through RLS (settings, staff, categories).
create or replace function public.audit_config_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
  v_target uuid;
  v_meta jsonb;
begin
  v_action := case tg_table_name when 'platform_settings' then 'settings' when 'staff' then 'staff' else 'category' end
              || '.' || lower(case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end);
  v_target := (coalesce(to_jsonb(new), to_jsonb(old)) ->> case tg_table_name when 'staff' then 'user_id' when 'categories' then 'id' end)::uuid;
  v_meta := jsonb_build_object('old', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
                               'new', case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  insert into public.audit_log (actor_id, actor_kind, action, target_table, target_id, metadata)
  values (auth.uid(), case when auth.uid() is null then 'system' else 'staff' end, v_action, tg_table_name, v_target, v_meta);
  return coalesce(new, old);
end $$;
create trigger audit_platform_settings after insert or update or delete on public.platform_settings
  for each row execute function public.audit_config_change();
create trigger audit_staff after insert or update or delete on public.staff
  for each row execute function public.audit_config_change();
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function public.audit_config_change();
