-- MyHomeSeller · Lower AI allowances, a monthly Ask MyHomeSeller limit, and AI credit packs.
--
-- Owner's decisions, 27 Nov 2026:
--   * AI replies a month: Basic 3,000 (unchanged), Pro 6,000, Agency 15,000.
--   * Ask MyHomeSeller questions a month: Basic 150, Pro 400, Agency 1,000.
--   * AI credit packs, paid by GCash like plans: 1,000 credits for ₱149, 3,000 for ₱399,
--     10,000 for ₱1,199. Credits last 12 months from the day the payment is confirmed.
--   * A credit pays for one AI reply; an Ask MyHomeSeller question takes 2. Credits are
--     used only after the plan's own allowance for the month is used up, the ones that
--     expire soonest first.
-- Nothing here is written by clients: payments are confirmed by a super admin through
-- the server, and credits are spent by the server.

-- ---------------------------------------------------------------------------
-- 1. Allowances
-- ---------------------------------------------------------------------------
-- ai_assistant: Ask MyHomeSeller questions a month; 0 = not included.
insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('pro', 'ai_replies', 6000),
  ('agency', 'ai_replies', 15000),
  ('free', 'ai_assistant', 0),
  ('basic', 'ai_assistant', 150),
  ('pro', 'ai_assistant', 400),
  ('agency', 'ai_assistant', 1000)
) as e(code, feature_key, lim) on e.code = p.code
on conflict (plan_id, feature_key) do update set "limit" = excluded."limit";

-- ---------------------------------------------------------------------------
-- 2. Credit packs
-- ---------------------------------------------------------------------------
create table if not exists public.credit_packs (
  code text primary key check (code ~ '^[a-z0-9_]{1,40}$'),
  credits int not null check (credits between 1 and 1000000),
  price_minor int not null check (price_minor > 0),
  valid_months int not null default 12 check (valid_months between 1 and 36),
  sort_order int not null default 0,
  is_active boolean not null default true
);
alter table public.credit_packs enable row level security;
drop policy if exists credit_packs_select on public.credit_packs;
create policy credit_packs_select on public.credit_packs for select to authenticated using (true);
revoke all on table public.credit_packs from authenticated;
grant select on table public.credit_packs to authenticated;

insert into public.credit_packs (code, credits, price_minor, valid_months, sort_order, is_active) values
  ('credits_1000', 1000, 14900, 12, 1, true),
  ('credits_3000', 3000, 39900, 12, 2, true),
  ('credits_10000', 10000, 119900, 12, 3, true)
on conflict (code) do update set credits = excluded.credits, price_minor = excluded.price_minor,
  valid_months = excluded.valid_months, sort_order = excluded.sort_order, is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 3. A payment buys a plan or a credit pack
-- ---------------------------------------------------------------------------
alter table public.payments add column if not exists pack_code text references public.credit_packs (code);
alter table public.payments alter column plan_id drop not null;
alter table public.payments drop constraint if exists payments_item_check;
alter table public.payments add constraint payments_item_check check ((plan_id is null) <> (pack_code is null));
-- Credits are for businesses, not buyer accounts.
alter table public.payments drop constraint if exists payments_pack_business_check;
alter table public.payments add constraint payments_pack_business_check check (pack_code is null or business_id is not null);

-- One plan payment and one pack payment waiting for review per business at a time.
drop index if exists public.payments_one_pending;
create unique index payments_one_pending on public.payments (business_id) where status = 'pending' and pack_code is null;
create unique index if not exists payments_one_pending_pack on public.payments (business_id) where status = 'pending' and pack_code is not null;

-- ---------------------------------------------------------------------------
-- 4. Credits a business holds, one row per pack bought
-- ---------------------------------------------------------------------------
create table if not exists public.ai_credit_lots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  credits int not null check (credits > 0),
  remaining int not null check (remaining >= 0 and remaining <= credits),
  expires_at timestamptz not null,
  payment_id uuid unique references public.payments (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_lots_open on public.ai_credit_lots (business_id, expires_at) where remaining > 0;
alter table public.ai_credit_lots enable row level security;
drop policy if exists ai_credit_lots_select on public.ai_credit_lots;
create policy ai_credit_lots_select on public.ai_credit_lots for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));
revoke all on table public.ai_credit_lots from authenticated;
grant select on table public.ai_credit_lots to authenticated;

-- ---------------------------------------------------------------------------
-- 5. AI uses: every Ask MyHomeSeller question, and every reply paid with credits
-- ---------------------------------------------------------------------------
create table if not exists public.ai_uses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  feature text not null check (feature in ('reply', 'ask')),
  credits int not null default 0 check (credits between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists ai_uses_business on public.ai_uses (business_id, feature, created_at desc);
alter table public.ai_uses enable row level security;
drop policy if exists ai_uses_select on public.ai_uses;
-- The whole team sees how much of the month's allowance is used (no content is kept here).
create policy ai_uses_select on public.ai_uses for select to authenticated
  using (public.is_member(business_id));
revoke all on table public.ai_uses from authenticated;
grant select on table public.ai_uses to authenticated;

-- Credits a business can still use. Runs with the caller's rights, so a signed-in
-- person only ever sees their own business's credits.
create or replace function public.ai_credit_balance(p_business uuid)
returns int
language sql stable set search_path = public as $$
  select coalesce(sum(remaining), 0)::int from public.ai_credit_lots
  where business_id = p_business and remaining > 0 and expires_at > now();
$$;

-- Server only. Records one AI use. With p_credits > 0 it takes that many credits, the
-- ones that expire soonest first, and returns p_credits; when there aren't enough it
-- takes none, records nothing and returns -1.
create or replace function public.record_ai_use(p_business uuid, p_feature text, p_credits int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  need int := p_credits;
  have int;
  lot record;
  take int;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function record_ai_use';
  end if;
  if p_feature not in ('reply', 'ask') or p_credits is null or p_credits < 0 or p_credits > 100 then
    raise exception 'not a valid AI use';
  end if;
  if need > 0 then
    -- Lock the business's open lots so two uses at once can't spend the same credit.
    perform 1 from public.ai_credit_lots
      where business_id = p_business and remaining > 0 and expires_at > now() for update;
    select coalesce(sum(remaining), 0) into have from public.ai_credit_lots
      where business_id = p_business and remaining > 0 and expires_at > now();
    if have < need then
      return -1;
    end if;
    for lot in
      select id, remaining from public.ai_credit_lots
      where business_id = p_business and remaining > 0 and expires_at > now()
      order by expires_at, created_at
    loop
      take := least(lot.remaining, need);
      update public.ai_credit_lots set remaining = remaining - take where id = lot.id;
      need := need - take;
      exit when need = 0;
    end loop;
  end if;
  insert into public.ai_uses (business_id, feature, credits) values (p_business, p_feature, p_credits);
  return p_credits;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Confirming a payment: a plan extends the period, a pack adds credits
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(p_payment uuid, p_reviewer uuid)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  pack public.credit_packs;
  cur_plan uuid;
  cur_end timestamptz;
  starts timestamptz;
  ends timestamptz;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function apply_payment';
  end if;
  if not coalesce((select is_superadmin from public.profiles where id = p_reviewer), false) then
    raise exception 'only a ProPilot super admin can confirm payments';
  end if;

  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.status <> 'pending' then
    raise exception 'this payment is not waiting for review';
  end if;

  if pay.pack_code is not null then
    select * into pack from public.credit_packs where code = pay.pack_code;
    starts := now();
    ends := starts + make_interval(months => pack.valid_months);
    insert into public.ai_credit_lots (business_id, credits, remaining, expires_at, payment_id)
    values (pay.business_id, pack.credits, pack.credits, ends, pay.id);
    update public.payments
    set status = 'confirmed', reviewed_by = p_reviewer, reviewed_at = now(), period_start = starts, period_end = ends
    where id = pay.id;
    return query select starts, ends;
    return;
  end if;

  if pay.business_id is not null then
    select plan_id, current_period_end into cur_plan, cur_end from public.subscriptions where business_id = pay.business_id for update;
  else
    select plan_id, current_period_end into cur_plan, cur_end from public.buyer_subscriptions where user_id = pay.buyer_id for update;
  end if;

  -- Renewing the same plan early adds on to the end; otherwise the new period starts now.
  starts := case when cur_plan = pay.plan_id and cur_end > now() then cur_end else now() end;
  ends := starts + make_interval(months => pay.months);

  if pay.business_id is not null then
    insert into public.subscriptions (business_id, plan_id, current_period_start, current_period_end, updated_at)
    values (pay.business_id, pay.plan_id, starts, ends, now())
    on conflict (business_id) do update set
      plan_id = excluded.plan_id,
      current_period_start = case when public.subscriptions.plan_id = excluded.plan_id and public.subscriptions.current_period_end > now()
        then public.subscriptions.current_period_start else excluded.current_period_start end,
      current_period_end = excluded.current_period_end,
      updated_at = now();
  else
    insert into public.buyer_subscriptions (user_id, plan_id, current_period_start, current_period_end, updated_at)
    values (pay.buyer_id, pay.plan_id, starts, ends, now())
    on conflict (user_id) do update set
      plan_id = excluded.plan_id,
      current_period_start = case when public.buyer_subscriptions.plan_id = excluded.plan_id and public.buyer_subscriptions.current_period_end > now()
        then public.buyer_subscriptions.current_period_start else excluded.current_period_start end,
      current_period_end = excluded.current_period_end,
      updated_at = now();
  end if;

  update public.payments
  set status = 'confirmed', reviewed_by = p_reviewer, reviewed_at = now(), period_start = starts, period_end = ends
  where id = pay.id;

  return query select starts, ends;
end;
$$;

revoke execute on function public.apply_payment(uuid, uuid) from public, authenticated;
revoke execute on function public.record_ai_use(uuid, text, int) from public, authenticated;
revoke execute on function public.ai_credit_balance(uuid) from public;
grant execute on function public.ai_credit_balance(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.apply_payment(uuid, uuid) from anon;
    revoke execute on function public.record_ai_use(uuid, text, int) from anon;
    revoke execute on function public.ai_credit_balance(uuid) from anon;
    revoke all on table public.credit_packs from anon;
    revoke all on table public.ai_credit_lots from anon;
    revoke all on table public.ai_uses from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.apply_payment(uuid, uuid) to service_role;
    grant execute on function public.record_ai_use(uuid, text, int) to service_role;
    grant execute on function public.ai_credit_balance(uuid) to service_role;
  end if;
end;
$$;
