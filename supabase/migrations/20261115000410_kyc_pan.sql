-- PAN is needed in full for the Razorpay linked account, so it is stored encrypted (same Vault key).
alter table public.verification_checks add column pan_encrypted bytea;

create or replace function public.store_pan(p_check_id uuid, p_pan text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'bank_account_key';
  if v_key is null then raise exception 'bank_account_key missing from vault'; end if;
  update public.verification_checks
     set pan_encrypted = extensions.pgp_sym_encrypt(p_pan, v_key),
         masked_ref = left(p_pan, 2) || 'XXXXXX' || right(p_pan, 2)
   where id = p_check_id and kind = 'pan';
  if not found then raise exception 'pan verification check % not found', p_check_id; end if;
end $$;

create or replace function public.reveal_pan(p_check_id uuid) returns text
language sql security definer set search_path = '' as $$
  select extensions.pgp_sym_decrypt(vc.pan_encrypted,
           (select decrypted_secret from vault.decrypted_secrets where name = 'bank_account_key'))
  from public.verification_checks vc where vc.id = p_check_id;
$$;

revoke execute on function public.store_pan(uuid, text), public.reveal_pan(uuid) from public, anon, authenticated;
grant execute on function public.store_pan(uuid, text), public.reveal_pan(uuid) to service_role;
