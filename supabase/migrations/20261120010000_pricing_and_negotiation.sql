-- MyHomeSeller · AI chat language, the Pricing Advisor (Agency) and AI negotiation (Pro, Agency).
--
-- 1. The AI chat answers in Taglish unless the business switches it to English.
-- 2. An owner can set the lowest price they'd accept for a listing. It lives in
--    its own table so only owners and admins can read it. The AI is never told
--    the number: the server compares each offer with it.
-- 3. Offers the AI collects wait for the owner to confirm or decline.
-- 4. Price checks: the AI researches comparable listings; Agency gets 20 a month.

-- ---------------------------------------------------------------------------
-- 1. AI chat language
-- ---------------------------------------------------------------------------
alter table public.agent_settings
  add column if not exists chat_language text not null default 'taglish' check (chat_language in ('taglish', 'english'));

-- ---------------------------------------------------------------------------
-- 2. The lowest price an owner would accept (private)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_floors (
  property_id uuid primary key references public.properties (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  min_price_minor bigint not null check (min_price_minor > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.listing_floors enable row level security;

-- The business always comes from the listing, so nobody can file a floor for
-- another business's property under their own business.
create or replace function public.listing_floors_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  asking bigint;
begin
  select business_id, price_minor into biz, asking from public.properties where id = new.property_id;
  if biz is null then
    raise exception 'listing not found';
  end if;
  if new.min_price_minor > asking then
    raise exception 'the lowest price can''t be above the asking price';
  end if;
  new.business_id := biz;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists listing_floors_guard on public.listing_floors;
create trigger listing_floors_guard
  before insert or update on public.listing_floors
  for each row execute function public.listing_floors_guard();

drop policy if exists listing_floors_select on public.listing_floors;
create policy listing_floors_select on public.listing_floors for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));
drop policy if exists listing_floors_insert on public.listing_floors;
create policy listing_floors_insert on public.listing_floors for insert to authenticated
  with check (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));
drop policy if exists listing_floors_update on public.listing_floors;
create policy listing_floors_update on public.listing_floors for update to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));
drop policy if exists listing_floors_delete on public.listing_floors;
create policy listing_floors_delete on public.listing_floors for delete to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- 3. Offers the AI collected in a chat
-- ---------------------------------------------------------------------------
-- too_low: under the owner's lowest price. countered: the AI asked for more.
-- pending: acceptable, waiting for the owner. confirmed / declined: the owner's answer.
create table if not exists public.listing_offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  conversation_id uuid references public.messenger_conversations (id) on delete set null,
  prospect_id uuid references public.prospects (id) on delete set null,
  buyer_name text check (char_length(buyer_name) <= 120),
  amount_minor bigint not null check (amount_minor > 0),
  counter_minor bigint check (counter_minor > 0),
  outcome text not null check (outcome in ('too_low', 'countered', 'pending', 'confirmed', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists listing_offers_business on public.listing_offers (business_id, created_at desc);
create index if not exists listing_offers_conversation on public.listing_offers (conversation_id, property_id);
create index if not exists listing_offers_property on public.listing_offers (property_id);
alter table public.listing_offers enable row level security;
drop policy if exists listing_offers_select on public.listing_offers;
create policy listing_offers_select on public.listing_offers for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

-- Server only. Records one offer from a chat. An acceptable offer moves the lead
-- to the Offer stage and is logged on it. Returns the offer's id, or null if the
-- listing isn't for sale any more.
create or replace function public.record_offer(p_property uuid, p_conversation uuid, p_amount bigint, p_counter bigint, p_outcome text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  pname text;
  pid uuid;
  oid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function record_offer';
  end if;
  if p_outcome not in ('too_low', 'countered', 'pending') then
    raise exception 'invalid outcome';
  end if;
  select business_id, name into biz, pname from public.properties where id = p_property and status = 'available';
  if biz is null then
    return null;
  end if;
  select prospect_id into pid from public.messenger_conversations where id = p_conversation and business_id = biz;
  insert into public.listing_offers (business_id, property_id, conversation_id, prospect_id, buyer_name, amount_minor, counter_minor, outcome)
  values (
    biz, p_property,
    (select id from public.messenger_conversations where id = p_conversation and business_id = biz),
    pid, nullif(left(coalesce(p_name, ''), 120), ''), p_amount, p_counter, p_outcome
  )
  returning id into oid;
  if p_outcome = 'pending' and pid is not null then
    perform public.pipeline_advance(pid, 'offer');
    insert into public.prospect_events (business_id, prospect_id, kind, body)
    values (biz, pid, 'task', left('Offered ₱' || to_char(p_amount / 100, 'FM999,999,999,999') || ' for ' || coalesce(pname, 'a listing') || '. Waiting for the owner to confirm.', 1000));
  end if;
  return oid;
end;
$$;

-- The owner's answer to a pending offer. Returns 'confirmed', 'declined', 'denied' or 'not_pending'.
create or replace function public.decide_offer(p_offer uuid, p_confirm boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  o public.listing_offers%rowtype;
  pname text;
begin
  select * into o from public.listing_offers where id = p_offer for update;
  if o.id is null or auth.uid() is null or not public.has_role(o.business_id, array['owner', 'admin']::public.business_role[]) then
    return 'denied';
  end if;
  if o.outcome <> 'pending' then
    return 'not_pending';
  end if;
  update public.listing_offers
  set outcome = case when p_confirm then 'confirmed' else 'declined' end, decided_by = auth.uid(), decided_at = now()
  where id = p_offer;
  if o.prospect_id is not null then
    select name into pname from public.properties where id = o.property_id;
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (
      o.business_id, o.prospect_id, 'task',
      left('Offer of ₱' || to_char(o.amount_minor / 100, 'FM999,999,999,999') || ' for ' || coalesce(pname, 'a listing')
        || case when p_confirm then ' confirmed' else ' declined' end, 1000),
      auth.uid()
    );
    update public.prospects set last_activity_at = now() where id = o.prospect_id;
  end if;
  return case when p_confirm then 'confirmed' else 'declined' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Price checks (the Pricing Advisor)
-- ---------------------------------------------------------------------------
create table if not exists public.price_checks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  input jsonb not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create index if not exists price_checks_business on public.price_checks (business_id, created_at desc);
alter table public.price_checks enable row level security;
drop policy if exists price_checks_select on public.price_checks;
create policy price_checks_select on public.price_checks for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

-- Server only. Takes one price check from the month's allowance (Manila month) and
-- returns its id, or null when the user isn't on the team or the allowance is used up.
-- p_limit is the plan's monthly limit (null = unlimited, 0 = not included).
create or replace function public.price_check_start(p_business uuid, p_user uuid, p_limit int, p_property uuid, p_input jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  used int;
  cid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function price_check_start';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = p_user and status = 'active' and role in ('owner', 'admin', 'agent')
  ) then
    return null;
  end if;
  -- One at a time per business, so the count below can't be raced past.
  perform pg_advisory_xact_lock(hashtext('price_check:' || p_business::text));
  if p_limit is not null then
    select count(*) into used from public.price_checks
      where business_id = p_business
        and created_at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
    if used >= p_limit then
      return null;
    end if;
  end if;
  insert into public.price_checks (business_id, created_by, property_id, input)
  values (p_business, p_user, (select id from public.properties where id = p_property and business_id = p_business), p_input)
  returning id into cid;
  return cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. What each plan includes
-- ---------------------------------------------------------------------------
-- ai_negotiation: the AI may negotiate offers (Pro, Agency). ai_price_checks: price checks a month (Agency).
insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('pro', 'ai_negotiation', null::int),
  ('agency', 'ai_negotiation', null::int),
  ('agency', 'ai_price_checks', 20)
) as e(code, feature_key, lim) on e.code = p.code
on conflict (plan_id, feature_key) do update set "limit" = excluded."limit";

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.listing_floors_guard() from public;
revoke all on function public.record_offer(uuid, uuid, bigint, bigint, text, text) from public;
revoke all on function public.price_check_start(uuid, uuid, int, uuid, jsonb) from public;
revoke all on function public.decide_offer(uuid, boolean) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.record_offer(uuid, uuid, bigint, bigint, text, text) from anon, authenticated';
    execute 'revoke all on function public.price_check_start(uuid, uuid, int, uuid, jsonb) from anon, authenticated';
    execute 'revoke all on function public.decide_offer(uuid, boolean) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.decide_offer(uuid, boolean) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_offer(uuid, uuid, bigint, bigint, text, text) to service_role';
    execute 'grant execute on function public.price_check_start(uuid, uuid, int, uuid, jsonb) to service_role';
  end if;
end;
$$;
