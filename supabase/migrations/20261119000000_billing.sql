-- ProPilot AI · Plans, subscriptions and GCash payments.
--
-- Two plans to start: Free (everything except AI) and Basic (₱499 a month,
-- AI included, up to 5 Home Finder AI buyers a month). Owners pay by GCash and
-- type the reference number; a ProPilot super admin checks it in GCash and
-- confirms. Confirming extends the business's paid period. When the period
-- ends, the business is on Free again. Nothing here is written by clients.

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
update public.plans set is_active = false where code in ('free_trial', 'starter', 'professional');

insert into public.plans (code, name, price_minor, trial_days, sort_order, is_active) values
  ('free', 'Free', 0, 0, 0, true),
  ('basic', 'Basic', 49900, 0, 1, true)
on conflict (code) do update set name = excluded.name, price_minor = excluded.price_minor, sort_order = excluded.sort_order, is_active = true;

-- Feature limits. No row = not included; a null limit = unlimited; 0 = not included.
delete from public.plan_entitlements where plan_id in (select id from public.plans where code in ('free', 'basic'));
insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('free', 'ai', 0),
  ('free', 'home_finder_buyers', 0),
  ('free', 'ai_video_generations', 0),
  ('basic', 'ai', null),
  ('basic', 'home_finder_buyers', 5),
  ('basic', 'ai_video_generations', 0)
) as e(code, feature_key, lim) on e.code = p.code;

-- ---------------------------------------------------------------------------
-- Subscriptions: the paid period a business is in
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_member(business_id));

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  months int not null default 1 check (months between 1 and 12),
  amount_minor int not null check (amount_minor >= 0),
  -- gcash: paid by the owner. complimentary: given by a super admin.
  method text not null default 'gcash' check (method in ('gcash', 'complimentary')),
  -- GCash reference numbers are 13 digits.
  reference text check (reference ~ '^[0-9]{13}$'),
  payer_name text check (char_length(payer_name) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  submitted_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text check (char_length(reject_reason) <= 300),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  check (method <> 'gcash' or (reference is not null and payer_name is not null))
);
-- A GCash reference can only be used once (unless that payment was rejected).
create unique index if not exists payments_reference_once on public.payments (reference) where status <> 'rejected';
-- One payment waiting for review per business at a time.
create unique index if not exists payments_one_pending on public.payments (business_id) where status = 'pending';
create index if not exists payments_status on public.payments (status, created_at);
alter table public.payments enable row level security;

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- Confirming a payment (server only, after checking the reviewer is a super admin)
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment(p_payment uuid, p_reviewer uuid)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
  sub public.subscriptions;
  starts timestamptz;
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

  select * into sub from public.subscriptions where business_id = pay.business_id for update;
  -- Renewing the same plan early adds on to the end; otherwise the new period starts now.
  starts := case
    when found and sub.plan_id = pay.plan_id and sub.current_period_end > now() then sub.current_period_end
    else now() end;

  insert into public.subscriptions (business_id, plan_id, current_period_start, current_period_end, updated_at)
  values (pay.business_id, pay.plan_id, starts, starts + make_interval(months => pay.months), now())
  on conflict (business_id) do update set
    plan_id = excluded.plan_id,
    current_period_start = case when public.subscriptions.plan_id = excluded.plan_id and public.subscriptions.current_period_end > now()
      then public.subscriptions.current_period_start else excluded.current_period_start end,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  update public.payments
  set status = 'confirmed', reviewed_by = p_reviewer, reviewed_at = now(),
      period_start = starts, period_end = starts + make_interval(months => pay.months)
  where id = pay.id;

  return query select starts, starts + make_interval(months => pay.months);
end;
$$;
revoke execute on function public.apply_payment(uuid, uuid) from public, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.apply_payment(uuid, uuid) from anon;
  end if;
end;
$$;
