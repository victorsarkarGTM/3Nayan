-- Any signed-in user can see their own staff row (lets apps detect staff accounts before MFA).
create policy staff_select_own on public.staff for select to authenticated using (user_id = auth.uid());
