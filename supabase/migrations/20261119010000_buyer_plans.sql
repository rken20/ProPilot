-- ProPilot AI · Plans for buyers.
--
-- Buyers can be on Basic too (same plan, same price, paid by GCash the same
-- way). A buyer on Basic gets the buyer-side AI: AI search of other property
-- sites, AI answers on listings, AI replies when messaging an agent, and match
-- alerts later. A payment belongs to either a business or a buyer.

create table if not exists public.buyer_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
alter table public.buyer_subscriptions enable row level security;

drop policy if exists buyer_subscriptions_select on public.buyer_subscriptions;
create policy buyer_subscriptions_select on public.buyer_subscriptions for select to authenticated
  using (user_id = auth.uid());

-- Payments: for a business or for a buyer, never both.
alter table public.payments alter column business_id drop not null;
alter table public.payments add column if not exists buyer_id uuid references auth.users (id) on delete cascade;
alter table public.payments drop constraint if exists payments_payer_check;
alter table public.payments add constraint payments_payer_check check ((business_id is null) <> (buyer_id is null));
create unique index if not exists payments_one_pending_buyer on public.payments (buyer_id) where status = 'pending' and buyer_id is not null;

drop policy if exists payments_buyer_select on public.payments;
create policy payments_buyer_select on public.payments for select to authenticated
  using (buyer_id = auth.uid());

-- Confirming now handles both kinds of payment.
create or replace function public.apply_payment(p_payment uuid, p_reviewer uuid)
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  pay public.payments;
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.apply_payment(uuid, uuid) from anon;
  end if;
end;
$$;
