-- Home Finder AI · Property matcher and Buyer Finder.
--
-- Matching is a Basic feature on both sides. Buyers on Basic can opt in (off by
-- default) to let agents with matching listings send them those listings, and
-- to get emails about new matching listings. When an agent sends a listing
-- through Buyer Finder, the buyer sees it on My search and decides whether to
-- message the agent. Agents never see who the buyer is. Sending counts toward
-- the business's monthly limit, which the server enforces here so two clicks
-- can't go over it.

alter table public.buyer_preferences
  add column if not exists open_to_agents boolean not null default false,
  add column if not exists match_alerts boolean not null default false,
  add column if not exists match_alerts_sent_at timestamptz;

create index if not exists buyer_preferences_open on public.buyer_preferences (user_id) where open_to_agents;

-- ---------------------------------------------------------------------------
-- Listings sent to a buyer through Buyer Finder
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_introductions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  score int check (score between 0 and 100),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  dismissed_at timestamptz,
  unique (property_id, buyer_id)
);
create index if not exists buyer_introductions_business_month on public.buyer_introductions (business_id, created_at);
create index if not exists buyer_introductions_buyer on public.buyer_introductions (buyer_id, created_at desc);
alter table public.buyer_introductions enable row level security;

-- Buyers see and dismiss their own. Businesses read them through the server only,
-- so a buyer's id never reaches an agent's browser.
drop policy if exists buyer_introductions_own_select on public.buyer_introductions;
create policy buyer_introductions_own_select on public.buyer_introductions for select to authenticated
  using (buyer_id = auth.uid());
drop policy if exists buyer_introductions_own_update on public.buyer_introductions;
create policy buyer_introductions_own_update on public.buyer_introductions for update to authenticated
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

-- A buyer may only mark one as seen or dismissed.
create or replace function public.buyer_introductions_guard()
returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.id := old.id;
    new.business_id := old.business_id;
    new.property_id := old.property_id;
    new.buyer_id := old.buyer_id;
    new.sent_by := old.sent_by;
    new.score := old.score;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists buyer_introductions_guard on public.buyer_introductions;
create trigger buyer_introductions_guard before update on public.buyer_introductions
  for each row execute function public.buyer_introductions_guard();

-- ---------------------------------------------------------------------------
-- Sending a listing (server only)
-- ---------------------------------------------------------------------------
-- Returns 'sent', or why not: 'not_public', 'denied', 'not_open', 'not_basic', 'already', 'limit'.
-- p_limit is the plan's monthly limit (null = unlimited, 0 = not included).
create or replace function public.buyer_finder_introduce(p_property uuid, p_buyer uuid, p_user uuid, p_limit int, p_score int default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  used int;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function buyer_finder_introduce';
  end if;
  select business_id into biz from public.properties
    where id = p_property and is_public and status = 'available';
  if biz is null then
    return 'not_public';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = biz and user_id = p_user and status = 'active' and role in ('owner', 'admin', 'agent')
  ) then
    return 'denied';
  end if;
  if not exists (select 1 from public.buyer_preferences where user_id = p_buyer and open_to_agents) then
    return 'not_open';
  end if;
  -- Matching is a Basic feature for buyers too.
  if not exists (
    select 1 from public.buyer_subscriptions s join public.plans pl on pl.id = s.plan_id
    where s.user_id = p_buyer and s.current_period_end > now() and pl.code <> 'free'
  ) then
    return 'not_basic';
  end if;

  -- One sender at a time per business, so the count below can't be raced past.
  perform pg_advisory_xact_lock(hashtext('buyer_finder:' || biz::text));
  if exists (select 1 from public.buyer_introductions where property_id = p_property and buyer_id = p_buyer) then
    return 'already';
  end if;
  if p_limit is not null then
    select count(*) into used from public.buyer_introductions
      where business_id = biz
        and created_at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
    if used >= p_limit then
      return 'limit';
    end if;
  end if;

  insert into public.buyer_introductions (business_id, property_id, buyer_id, sent_by, score)
  values (biz, p_property, p_buyer, p_user, least(greatest(p_score, 0), 100));
  return 'sent';
end;
$$;

revoke all on function public.buyer_finder_introduce(uuid, uuid, uuid, int, int) from public;
revoke all on function public.buyer_introductions_guard() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.buyer_finder_introduce(uuid, uuid, uuid, int, int) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.buyer_finder_introduce(uuid, uuid, uuid, int, int) to service_role';
  end if;
end;
$$;

-- The property matcher's suggestions are 'reminder' or 'message' tasks from agent 'matcher'.
