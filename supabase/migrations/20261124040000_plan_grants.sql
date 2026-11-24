-- Plans given for free by email, for beta testers.
--
-- A super admin types an email, a plan and a number of months. If that email
-- already signs in to an account that owns a business, the plan is on at once.
-- If not, the grant waits, and turns on when someone with that confirmed email
-- owns a business. Every grant that is used leaves a ₱0 "complimentary" payment,
-- so it shows in the business's payment history like the existing free grants.
--
-- Nothing here is written from the app as a signed-in user: the functions run
-- only on the server, and only a super admin can read the list.

create table if not exists public.plan_grants (
  id uuid primary key default gen_random_uuid(),
  -- Always lower case, so it matches however the person typed it when signing up.
  email text not null check (
    email = lower(email)
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  plan_id uuid not null references public.plans (id),
  months int not null check (months between 1 and 12),
  note text check (char_length(note) <= 200),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Filled in when the grant is used.
  business_id uuid references public.businesses (id) on delete set null,
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  payment_id uuid references public.payments (id) on delete set null,
  -- Or when a super admin takes it back before it is used.
  cancelled_at timestamptz,
  check (claimed_at is null or cancelled_at is null)
);
-- One grant waiting per email. Giving the same email again replaces it.
create unique index if not exists plan_grants_one_waiting on public.plan_grants (email) where claimed_at is null and cancelled_at is null;
create index if not exists plan_grants_recent on public.plan_grants (created_at desc);
alter table public.plan_grants enable row level security;

drop policy if exists plan_grants_select on public.plan_grants;
create policy plan_grants_select on public.plan_grants for select to authenticated
  using (public.my_is_superadmin());

-- ---------------------------------------------------------------------------
-- Turning a free plan on for a business (server only; callers decide who may)
-- ---------------------------------------------------------------------------
create or replace function public.plan_grant_apply(p_business uuid, p_plan uuid, p_months int, p_by uuid)
returns table (out_payment uuid, out_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  cur_plan uuid;
  cur_end timestamptz;
  starts timestamptz;
  ends timestamptz;
  pid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function plan_grant_apply';
  end if;
  if p_months is null or p_months not between 1 and 12 then
    raise exception 'months must be between 1 and 12';
  end if;
  -- The business row is the lock, because a business on Free has no subscription row yet.
  perform 1 from public.businesses where id = p_business for update;
  if not found then
    raise exception 'business not found';
  end if;

  select plan_id, current_period_end into cur_plan, cur_end from public.subscriptions where business_id = p_business for update;
  -- The same rule as a confirmed payment: more of the same plan adds on to the end; another plan starts now.
  starts := case when cur_plan = p_plan and cur_end > now() then cur_end else now() end;
  ends := starts + make_interval(months => p_months);

  insert into public.subscriptions (business_id, plan_id, current_period_start, current_period_end, updated_at)
  values (p_business, p_plan, starts, ends, now())
  on conflict (business_id) do update set
    plan_id = excluded.plan_id,
    current_period_start = case when public.subscriptions.plan_id = excluded.plan_id and public.subscriptions.current_period_end > now()
      then public.subscriptions.current_period_start else excluded.current_period_start end,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  insert into public.payments (business_id, plan_id, months, amount_minor, method, status, submitted_by, reviewed_by, reviewed_at, period_start, period_end)
  values (p_business, p_plan, p_months, 0, 'complimentary', 'confirmed', p_by, p_by, now(), starts, ends)
  returning id into pid;

  return query select pid, ends;
end;
$$;

-- ---------------------------------------------------------------------------
-- Give a plan to a business chosen from the list
-- ---------------------------------------------------------------------------
create or replace function public.grant_plan_to_business(p_business uuid, p_plan_code text, p_months int, p_by uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  plan uuid;
  ends timestamptz;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function grant_plan_to_business';
  end if;
  if not coalesce((select is_superadmin from public.profiles where id = p_by), false) then
    raise exception 'only a super admin can give plans';
  end if;
  select id into plan from public.plans where code = p_plan_code and is_active and price_minor > 0;
  if plan is null then
    raise exception 'unknown plan';
  end if;
  select out_end into ends from public.plan_grant_apply(p_business, plan, p_months, p_by);
  return ends;
end;
$$;

-- ---------------------------------------------------------------------------
-- Use the grants that are waiting
-- ---------------------------------------------------------------------------
-- For one person (just after they set up their business) or, with no argument,
-- for everyone. A grant is used only by an account whose email is confirmed, on
-- the first business that account owns. Returns how many were used.
create or replace function public.claim_plan_grants(p_user uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  g record;
  used int := 0;
  pid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function claim_plan_grants';
  end if;
  for g in
    select pg.id, pg.plan_id, pg.months, pg.granted_by, u.id as user_id, b.business_id
    from public.plan_grants pg
    join auth.users u on lower(u.email) = pg.email and u.email_confirmed_at is not null
    join lateral (
      select m.business_id
      from public.business_members m
      join public.businesses bz on bz.id = m.business_id
      where m.user_id = u.id and m.role = 'owner' and m.status = 'active'
      order by bz.created_at, bz.id
      limit 1
    ) b on true
    where pg.claimed_at is null and pg.cancelled_at is null and (p_user is null or u.id = p_user)
    order by pg.created_at
  loop
    -- Mark it used first; if another run got there before this one, skip it.
    update public.plan_grants
    set claimed_at = now(), claimed_by = g.user_id, business_id = g.business_id
    where id = g.id and claimed_at is null and cancelled_at is null;
    if not found then
      continue;
    end if;
    select out_payment into pid from public.plan_grant_apply(g.business_id, g.plan_id, g.months, g.granted_by);
    update public.plan_grants set payment_id = pid where id = g.id;
    used := used + 1;
  end loop;
  return used;
end;
$$;

-- ---------------------------------------------------------------------------
-- Give a plan to an email
-- ---------------------------------------------------------------------------
-- status: 'applied' (the plan is on, for the business named), 'waiting_business'
-- (the account exists but owns no business yet) or 'waiting_signup' (nobody has
-- signed up with that email yet).
create or replace function public.grant_plan_by_email(p_email text, p_plan_code text, p_months int, p_note text, p_by uuid)
returns table (status text, business_id uuid, business_name text, period_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  addr text := lower(btrim(coalesce(p_email, '')));
  plan uuid;
  grant_id uuid;
  person uuid;
  g public.plan_grants;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function grant_plan_by_email';
  end if;
  if not coalesce((select is_superadmin from public.profiles where id = p_by), false) then
    raise exception 'only a super admin can give plans';
  end if;
  if p_months is null or p_months not between 1 and 12 then
    raise exception 'months must be between 1 and 12';
  end if;
  select id into plan from public.plans where code = p_plan_code and is_active and price_minor > 0;
  if plan is null then
    raise exception 'unknown plan';
  end if;

  insert into public.plan_grants (email, plan_id, months, note, granted_by)
  values (addr, plan, p_months, nullif(btrim(coalesce(p_note, '')), ''), p_by)
  on conflict (email) where claimed_at is null and cancelled_at is null
  do update set plan_id = excluded.plan_id, months = excluded.months, note = excluded.note, granted_by = excluded.granted_by, created_at = now()
  returning id into grant_id;

  select u.id into person from auth.users u where lower(u.email) = addr and u.email_confirmed_at is not null order by u.id limit 1;
  if person is not null then
    perform public.claim_plan_grants(person);
  end if;

  select * into g from public.plan_grants where id = grant_id;
  if g.claimed_at is not null then
    return query
      select 'applied'::text, g.business_id, bz.name, pay.period_end
      from public.businesses bz
      left join public.payments pay on pay.id = g.payment_id
      where bz.id = g.business_id;
  elsif person is not null then
    return query select 'waiting_business'::text, null::uuid, null::text, null::timestamptz;
  else
    return query select 'waiting_signup'::text, null::uuid, null::text, null::timestamptz;
  end if;
end;
$$;

revoke execute on function public.plan_grant_apply(uuid, uuid, int, uuid) from public, authenticated;
revoke execute on function public.grant_plan_to_business(uuid, text, int, uuid) from public, authenticated;
revoke execute on function public.claim_plan_grants(uuid) from public, authenticated;
revoke execute on function public.grant_plan_by_email(text, text, int, text, uuid) from public, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.plan_grant_apply(uuid, uuid, int, uuid) from anon;
    revoke execute on function public.grant_plan_to_business(uuid, text, int, uuid) from anon;
    revoke execute on function public.claim_plan_grants(uuid) from anon;
    revoke execute on function public.grant_plan_by_email(text, text, int, text, uuid) from anon;
    revoke all on table public.plan_grants from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.plan_grant_apply(uuid, uuid, int, uuid) to service_role;
    grant execute on function public.grant_plan_to_business(uuid, text, int, uuid) to service_role;
    grant execute on function public.claim_plan_grants(uuid) to service_role;
    grant execute on function public.grant_plan_by_email(text, text, int, text, uuid) to service_role;
  end if;
end;
$$;
-- Signed-in users only ever read this table (and the policy lets only a super admin see rows).
revoke all on table public.plan_grants from authenticated;
grant select on table public.plan_grants to authenticated;
