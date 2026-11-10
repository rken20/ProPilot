-- ProPilot AI · Let people who sign in with Google choose buyer or agent once.
-- Email sign-ups choose on the form (stored in metadata). Google sign-ups arrive
-- without a choice, so they pick once after their first sign-in.

alter table public.profiles add column if not exists account_type_chosen boolean not null default false;

-- Everyone who already has a profile has effectively chosen.
update public.profiles set account_type_chosen = true where account_type_chosen = false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  chosen text := new.raw_user_meta_data ->> 'account_type';
begin
  insert into public.profiles (id, full_name, email, account_type, account_type_chosen)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.email,
    case when chosen = 'buyer' then 'buyer'::public.account_type else 'agent'::public.account_type end,
    coalesce(chosen in ('buyer', 'agent'), false)
  );
  return new;
end;
$$;

-- One-time choice. Does nothing if the user already chose.
create or replace function public.choose_account_type(p_type public.account_type)
returns public.account_type
language plpgsql security definer set search_path = public as $$
declare
  result public.account_type;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
     set account_type = p_type, account_type_chosen = true, updated_at = now()
   where id = auth.uid() and account_type_chosen = false;
  select account_type into result from public.profiles where id = auth.uid();
  return result;
end;
$$;

grant execute on function public.choose_account_type(public.account_type) to authenticated;

-- Users still can't flip account_type (or the chosen flag) through a normal profile update.
create or replace function public.my_account_type_chosen()
returns boolean
language sql stable security definer set search_path = public as $$
  select account_type_chosen from public.profiles where id = auth.uid()
$$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_superadmin = false
    and account_type = public.my_account_type()
    and account_type_chosen = public.my_account_type_chosen()
  );
