-- Scheduled jobs → the `jobs` Edge Function. The project URL and service-role key are read from
-- Vault secrets `project_url` and `service_role_key` (set per environment; see the staging runbook).
alter table public.notifications add column retries int not null default 0;

create or replace function public.invoke_job(p_job text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  v_key text := (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key');
begin
  if v_url is null or v_key is null then
    raise log 'invoke_job(%): vault secrets project_url/service_role_key not set; skipping', p_job;
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := jsonb_build_object('job', p_job)
  );
end $$;
revoke execute on function public.invoke_job(text) from public, anon, authenticated;

select cron.schedule('trial-reminders', '*/5 * * * *', $$ select public.invoke_job('trial-reminders') $$);
select cron.schedule('razorpay-sync', '0 */6 * * *', $$ select public.invoke_job('razorpay-sync') $$);
select cron.schedule('notification-retry', '*/15 * * * *', $$ select public.invoke_job('notification-retry') $$);
