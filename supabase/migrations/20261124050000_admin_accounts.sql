-- The app admin's Accounts screen: see who has signed up, change a business's
-- plan, restrict an account, and delete one.
--
-- Restricting uses profiles.status (active / suspended), which existed but did
-- nothing until now. A restricted person can still sign in, but the database
-- shows them none of their business's data, and a business whose owners are all
-- restricted is taken off public pages (businesses.restricted_at).
--
-- Every function here runs only on the server, for a super admin, and writes
-- an audit log line.

-- ---------------------------------------------------------------------------
-- A person can't lift their own restriction
-- ---------------------------------------------------------------------------
create or replace function public.my_account_status()
returns public.account_status
language sql stable security definer set search_path = public as $$
  select status from public.profiles where id = auth.uid()
$$;
revoke all on function public.my_account_status() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.my_account_status() from anon';
  end if;
end $$;
grant execute on function public.my_account_status() to authenticated;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_superadmin = public.my_is_superadmin()
    and account_type = public.my_account_type()
    and account_type_chosen = public.my_account_type_chosen()
    and status = public.my_account_status()
  );

-- ---------------------------------------------------------------------------
-- A restricted person is a member of nothing, as far as the rules are concerned
-- ---------------------------------------------------------------------------
-- Every business rule goes through member_role (is_member and has_role call it),
-- so this one change closes listings, leads, messages, billing and the rest.
create or replace function public.member_role(b uuid)
returns public.business_role
language sql stable security definer set search_path = public as $$
  select m.role
  from public.business_members m
  join public.profiles p on p.id = m.user_id and p.status = 'active'
  where m.business_id = b and m.user_id = auth.uid() and m.status = 'active'
$$;

-- Nor can they set up a new business or accept an invitation while restricted.
create or replace function public.business_members_block_restricted()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (select 1 from public.profiles where id = auth.uid() and status <> 'active') then
    raise exception 'this account is restricted';
  end if;
  return new;
end;
$$;
drop trigger if exists business_members_block_restricted on public.business_members;
create trigger business_members_block_restricted
  before insert on public.business_members
  for each row execute function public.business_members_block_restricted();

-- ---------------------------------------------------------------------------
-- A business whose owners are all restricted
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists restricted_at timestamptz;

-- Only the server sets it: an admin of the business can rename it, not lift this.
create or replace function public.businesses_guard_restricted()
returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.restricted_at is distinct from old.restricted_at then
    raise exception 'only MyHomeSeller can change this';
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_guard_restricted on public.businesses;
create trigger businesses_guard_restricted
  before update on public.businesses
  for each row execute function public.businesses_guard_restricted();

-- ---------------------------------------------------------------------------
-- The owner of a business can't be removed, except when the app admin deletes
-- the account
-- ---------------------------------------------------------------------------
-- The same rule as before (20261110010000), with one way through: the server,
-- with no signed-in user, inside admin_delete_account, which sets
-- app.admin_delete for its own transaction only.
create or replace function public.guard_member_changes()
returns trigger
language plpgsql set search_path = public as $$
declare
  actor public.business_role;
begin
  if old.role = 'owner' then
    if tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active' then
      if not (auth.uid() is null and tg_op = 'DELETE' and coalesce(current_setting('app.admin_delete', true), '') = '1') then
        raise exception 'the owner cannot be removed, demoted or deactivated';
      end if;
    end if;
  end if;

  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  actor := public.member_role(old.business_id);
  if actor = 'admin' then
    if old.role in ('owner', 'admin') or (tg_op = 'UPDATE' and new.role in ('owner', 'admin')) then
      raise exception 'admins can only manage agents and marketing staff';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may use the functions below
-- ---------------------------------------------------------------------------
create or replace function public.admin_check(p_by uuid, p_fn text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function %', p_fn;
  end if;
  if not coalesce((select is_superadmin from public.profiles where id = p_by), false) then
    raise exception 'only a super admin can do this';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The numbers at the top of the screen
-- ---------------------------------------------------------------------------
create or replace function public.admin_counts(p_by uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_by, 'admin_counts');
  return jsonb_build_object(
    'people', (select count(*) from public.profiles),
    'new_people_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signed_in_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'restricted', (select count(*) from public.profiles where status <> 'active'),
    'businesses', (select count(*) from public.businesses),
    'listings', (select count(*) from public.properties),
    'public_listings', (select count(*) from public.properties where is_public and status in ('available', 'reserved')),
    'plans', coalesce((
      select jsonb_object_agg(code, n) from (
        select coalesce(p.code, 'free') as code, count(*) as n
        from public.businesses b
        left join public.subscriptions s on s.business_id = b.id and s.current_period_end > now()
        left join public.plans p on p.id = s.plan_id
        group by 1
      ) t), '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The list: each person, with the businesses they belong to
-- ---------------------------------------------------------------------------
create or replace function public.admin_accounts(p_by uuid, p_search text default null, p_limit int default 200)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  is_superadmin boolean,
  signed_up timestamptz,
  last_sign_in timestamptz,
  businesses jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  needle text := lower(btrim(coalesce(p_search, '')));
begin
  perform public.admin_check(p_by, 'admin_accounts');
  return query
  select
    pr.id,
    u.email::text,
    pr.full_name,
    pr.status::text,
    pr.is_superadmin,
    pr.created_at,
    u.last_sign_in_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'role', m.role,
        'member_status', m.status,
        'restricted', b.restricted_at is not null,
        'plan_code', coalesce(pl.code, 'free'),
        'plan_name', coalesce(pl.name, 'Free'),
        'period_end', s.current_period_end,
        'listings', (select count(*) from public.properties x where x.business_id = b.id),
        -- Deleting this person deletes the business too when nobody else owns it.
        'sole_owner', m.role = 'owner' and not exists (
          select 1 from public.business_members o
          where o.business_id = b.id and o.user_id <> pr.id and o.role = 'owner' and o.status = 'active')
      ) order by b.created_at)
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      left join public.subscriptions s on s.business_id = b.id and s.current_period_end > now()
      left join public.plans pl on pl.id = s.plan_id
      where m.user_id = pr.id
    ), '[]'::jsonb)
  from public.profiles pr
  join auth.users u on u.id = pr.id
  where needle = ''
    or position(needle in lower(coalesce(u.email, ''))) > 0
    or position(needle in lower(pr.full_name)) > 0
    or exists (
      select 1 from public.business_members m join public.businesses b on b.id = m.business_id
      where m.user_id = pr.id and position(needle in lower(b.name)) > 0)
  order by pr.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- Change a business's plan
-- ---------------------------------------------------------------------------
-- 'free' ends the paid plan now. Any other plan runs until the end of p_until
-- (Manila time). Nothing is charged and no payment is recorded: the audit log
-- keeps who changed it and to what.
create or replace function public.admin_set_plan(p_business uuid, p_plan_code text, p_until date, p_by uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  plan uuid;
  ends timestamptz;
begin
  perform public.admin_check(p_by, 'admin_set_plan');
  perform 1 from public.businesses where id = p_business for update;
  if not found then
    raise exception 'business not found';
  end if;

  if p_plan_code = 'free' then
    delete from public.subscriptions where business_id = p_business;
    ends := null;
  else
    select id into plan from public.plans where code = p_plan_code and is_active and price_minor > 0;
    if plan is null then
      raise exception 'unknown plan';
    end if;
    if p_until is null then
      raise exception 'choose the date the plan runs until';
    end if;
    ends := ((p_until::text || ' 23:59:59')::timestamp at time zone 'Asia/Manila');
    if ends <= now() or ends > now() + interval '5 years' then
      raise exception 'the end date must be after today and within five years';
    end if;
    insert into public.subscriptions (business_id, plan_id, current_period_start, current_period_end, updated_at)
    values (p_business, plan, now(), ends, now())
    on conflict (business_id) do update set
      plan_id = excluded.plan_id,
      current_period_start = case when public.subscriptions.plan_id = excluded.plan_id and public.subscriptions.current_period_start < excluded.current_period_end
        then public.subscriptions.current_period_start else excluded.current_period_start end,
      current_period_end = excluded.current_period_end,
      updated_at = now();
  end if;

  insert into public.audit_logs (business_id, actor_id, action, target_type, target_id, metadata)
  values (p_business, p_by, 'admin.plan.set', 'business', p_business::text, jsonb_build_object('plan', p_plan_code, 'until', ends));
  return ends;
end;
$$;

-- ---------------------------------------------------------------------------
-- Restrict an account, or lift the restriction
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_restricted(p_user uuid, p_restricted boolean, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_by, 'admin_set_restricted');
  if p_user = p_by then
    raise exception 'you cannot restrict your own account';
  end if;
  if coalesce((select is_superadmin from public.profiles where id = p_user), false) then
    raise exception 'a super admin cannot be restricted';
  end if;

  update public.profiles
  set status = case when p_restricted then 'suspended' else 'active' end::public.account_status, updated_at = now()
  where id = p_user;
  if not found then
    raise exception 'account not found';
  end if;

  -- A business with no owner left who may use the app comes off public pages, and goes back when one may again.
  update public.businesses b
  set restricted_at = case
    when exists (
      select 1 from public.business_members o join public.profiles op on op.id = o.user_id
      where o.business_id = b.id and o.role = 'owner' and o.status = 'active' and op.status = 'active')
    then null else coalesce(b.restricted_at, now()) end
  where b.id in (select m.business_id from public.business_members m where m.user_id = p_user and m.role = 'owner');

  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (p_by, case when p_restricted then 'admin.account.restrict' else 'admin.account.unrestrict' end, 'user', p_user::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete an account
-- ---------------------------------------------------------------------------
-- The businesses that go with a person when they are deleted: the ones nobody
-- else owns. The app reads this first, to show what will be deleted and to
-- find the photo files to remove.
create or replace function public.admin_account_businesses(p_user uuid, p_by uuid)
returns table (business_id uuid, name text, listings bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_by, 'admin_account_businesses');
  return query
  select b.id, b.name, (select count(*) from public.properties x where x.business_id = b.id)
  from public.businesses b
  where (b.created_by = p_user
      or exists (select 1 from public.business_members m where m.business_id = b.id and m.user_id = p_user and m.role = 'owner'))
    and not exists (
      select 1 from public.business_members o
      where o.business_id = b.id and o.user_id <> p_user and o.role = 'owner' and o.status = 'active')
  order by b.created_at;
end;
$$;

-- Removes everything of theirs from the app's tables and clears what would stop
-- the sign-in itself from being deleted (the app does that next, through
-- Supabase). Businesses that someone else also owns are kept, and what this
-- person made there is handed to that owner. Returns the deleted businesses.
create or replace function public.admin_delete_account(p_user uuid, p_by uuid)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  doomed uuid[];
  addr text;
begin
  perform public.admin_check(p_by, 'admin_delete_account');
  if p_user = p_by then
    raise exception 'you cannot delete your own account here';
  end if;
  if coalesce((select is_superadmin from public.profiles where id = p_user), false) then
    raise exception 'a super admin cannot be deleted here';
  end if;
  select lower(email) into addr from auth.users where id = p_user;
  if not found then
    raise exception 'account not found';
  end if;

  select coalesce(array_agg(ab.business_id), '{}') into doomed from public.admin_account_businesses(p_user, p_by) ab;
  -- Lets this transaction, and nothing after it, remove an owner (see guard_member_changes).
  perform set_config('app.admin_delete', '1', true);
  -- Everything a business has (listings, photos' records, leads, messages, offers, payments) goes with it.
  delete from public.businesses where id = any(doomed);

  -- In businesses that stay, hand over what has to point at somebody.
  update public.businesses b
  set created_by = coalesce((
    select o.user_id from public.business_members o
    where o.business_id = b.id and o.user_id <> p_user and o.role = 'owner' and o.status = 'active'
    order by o.created_at limit 1), p_by)
  where b.created_by = p_user;
  update public.properties p set created_by = b.created_by from public.businesses b where b.id = p.business_id and p.created_by = p_user;
  update public.properties set assigned_agent_id = null where assigned_agent_id = p_user;
  update public.invitations i set invited_by = b.created_by from public.businesses b where b.id = i.business_id and i.invited_by = p_user;
  delete from public.business_members where user_id = p_user;
  -- Plans given to this email as a beta tester.
  delete from public.plan_grants where email = addr;
  perform set_config('app.admin_delete', '', true);

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_by, 'admin.account.delete', 'user', p_user::text, jsonb_build_object('businesses_deleted', coalesce(array_length(doomed, 1), 0)));
  return doomed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server only
-- ---------------------------------------------------------------------------
revoke execute on function public.admin_check(uuid, text) from public, authenticated;
revoke execute on function public.admin_counts(uuid) from public, authenticated;
revoke execute on function public.admin_accounts(uuid, text, int) from public, authenticated;
revoke execute on function public.admin_set_plan(uuid, text, date, uuid) from public, authenticated;
revoke execute on function public.admin_set_restricted(uuid, boolean, uuid) from public, authenticated;
revoke execute on function public.admin_account_businesses(uuid, uuid) from public, authenticated;
revoke execute on function public.admin_delete_account(uuid, uuid) from public, authenticated;
revoke execute on function public.business_members_block_restricted() from public, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.admin_check(uuid, text) from anon;
    revoke execute on function public.admin_counts(uuid) from anon;
    revoke execute on function public.admin_accounts(uuid, text, int) from anon;
    revoke execute on function public.admin_set_plan(uuid, text, date, uuid) from anon;
    revoke execute on function public.admin_set_restricted(uuid, boolean, uuid) from anon;
    revoke execute on function public.admin_account_businesses(uuid, uuid) from anon;
    revoke execute on function public.admin_delete_account(uuid, uuid) from anon;
    revoke execute on function public.business_members_block_restricted() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.admin_check(uuid, text) to service_role;
    grant execute on function public.admin_counts(uuid) to service_role;
    grant execute on function public.admin_accounts(uuid, text, int) to service_role;
    grant execute on function public.admin_set_plan(uuid, text, date, uuid) to service_role;
    grant execute on function public.admin_set_restricted(uuid, boolean, uuid) to service_role;
    grant execute on function public.admin_account_businesses(uuid, uuid) to service_role;
    grant execute on function public.admin_delete_account(uuid, uuid) to service_role;
  end if;
end;
$$;
