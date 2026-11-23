-- MyHomeSeller · Let the app owner edit their own profile.
-- The profile rule said "the saved row must not be a super admin", which was
-- meant to stop people promoting themselves. It also blocked every profile
-- change (name, mobile number, photo) for the one account that is a super
-- admin. The rule now says "the super admin flag must stay as it was", so
-- nobody can switch it on or off through a profile update.

create or replace function public.my_is_superadmin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.my_is_superadmin() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.my_is_superadmin() from anon';
  end if;
end $$;
grant execute on function public.my_is_superadmin() to authenticated;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_superadmin = public.my_is_superadmin()
    and account_type = public.my_account_type()
    and account_type_chosen = public.my_account_type_chosen()
  );
