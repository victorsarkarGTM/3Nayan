-- Staff (with MFA) can read profiles: the admin panel shows applicant names/phones and searches by phone.
create policy profiles_staff_read on public.profiles for select to authenticated using (public.is_staff());
