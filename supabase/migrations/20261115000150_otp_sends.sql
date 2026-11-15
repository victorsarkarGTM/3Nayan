-- Per-phone OTP rate limiting for the Send-SMS auth hook (service role only).
create table public.otp_sends (
  id bigint generated always as identity primary key,
  phone text not null,
  created_at timestamptz not null default now()
);
create index otp_sends_phone_idx on public.otp_sends (phone, created_at desc);
alter table public.otp_sends enable row level security;
revoke all on public.otp_sends from anon, authenticated;
