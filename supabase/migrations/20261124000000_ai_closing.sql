-- MyHomeSeller · The AI chat can close a deal at a price the owner pre-approved.
--
-- 1. Beside the private lowest price, an owner or admin can set an "accept right
--    away" price for a listing: between the lowest price and the asking price.
--    An offer at or above it is agreed by the AI on the spot. Offers between the
--    lowest price and it still wait for the owner, as before.
-- 2. Offers get a new outcome, 'accepted': agreed by the AI on the owner's
--    pre-approval. Only the server records one, and the database checks it:
--    the amount must reach the pre-approved price, and a listing can't have two
--    agreed deals (accepted, or confirmed by the owner) at once.
-- 3. An agreed deal has a reference number. The server shows it to the buyer
--    under the AI's reply; the AI is never told it, so a reply the AI was tricked
--    into writing can't carry a real one.

-- ---------------------------------------------------------------------------
-- 1. The pre-approved price (private, like the lowest price)
-- ---------------------------------------------------------------------------
alter table public.listing_floors
  add column if not exists accept_price_minor bigint check (accept_price_minor > 0);

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
  if new.accept_price_minor is not null and (new.accept_price_minor < new.min_price_minor or new.accept_price_minor > asking) then
    raise exception 'the pre-approved price must be between the lowest price and the asking price';
  end if;
  new.business_id := biz;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Deals the AI agreed
-- ---------------------------------------------------------------------------
alter table public.listing_offers drop constraint if exists listing_offers_outcome_check;
alter table public.listing_offers add constraint listing_offers_outcome_check
  check (outcome in ('too_low', 'countered', 'pending', 'confirmed', 'declined', 'accepted'));
alter table public.listing_offers
  add column if not exists deal_ref text unique check (deal_ref ~ '^[A-Z0-9]{8}$');

-- The old six-argument version is replaced by one with the reference.
drop function if exists public.record_offer(uuid, uuid, bigint, bigint, text, text);

-- Server only. Records one offer from a chat. An acceptable offer moves the lead
-- to the Offer stage and is logged on it. Returns the offer's id, or null if the
-- listing isn't for sale any more. An 'accepted' offer needs its reference, and
-- raises 'deal_taken' when the listing already has an agreed deal, and
-- 'not_pre_approved' when the amount doesn't reach the owner's pre-approved price.
create or replace function public.record_offer(p_property uuid, p_conversation uuid, p_amount bigint, p_counter bigint, p_outcome text, p_name text, p_ref text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  pname text;
  asking bigint;
  approved bigint;
  pid uuid;
  oid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function record_offer';
  end if;
  if p_outcome not in ('too_low', 'countered', 'pending', 'accepted') then
    raise exception 'invalid outcome';
  end if;
  select business_id, name, price_minor into biz, pname, asking from public.properties where id = p_property and status = 'available';
  if biz is null then
    return null;
  end if;
  if p_outcome = 'accepted' then
    if p_ref is null then
      raise exception 'a deal needs its reference';
    end if;
    -- One agreed deal per listing: two chats closing at once wait for each other here.
    perform pg_advisory_xact_lock(hashtext('deal:' || p_property::text));
    if exists (select 1 from public.listing_offers where property_id = p_property and outcome in ('accepted', 'confirmed')) then
      raise exception 'deal_taken';
    end if;
    -- least() skips nulls, so check for a pre-approved price before comparing with the asking price.
    select accept_price_minor into approved from public.listing_floors where property_id = p_property;
    if approved is null or p_amount < least(approved, asking) then
      raise exception 'not_pre_approved';
    end if;
  end if;
  select prospect_id into pid from public.messenger_conversations where id = p_conversation and business_id = biz;
  insert into public.listing_offers (business_id, property_id, conversation_id, prospect_id, buyer_name, amount_minor, counter_minor, outcome, decided_at, deal_ref)
  values (
    biz, p_property,
    (select id from public.messenger_conversations where id = p_conversation and business_id = biz),
    pid, nullif(left(coalesce(p_name, ''), 120), ''), p_amount, p_counter, p_outcome,
    case when p_outcome = 'accepted' then now() end,
    case when p_outcome = 'accepted' then p_ref end
  )
  returning id into oid;
  if p_outcome in ('pending', 'accepted') and pid is not null then
    perform public.pipeline_advance(pid, 'offer');
    insert into public.prospect_events (business_id, prospect_id, kind, body)
    values (biz, pid, 'task', left(
      case when p_outcome = 'accepted'
        then 'Deal agreed by the AI: ₱' || to_char(p_amount / 100, 'FM999,999,999,999') || ' for ' || coalesce(pname, 'a listing') || ' (ref. ' || p_ref || '), at or above the owner''s pre-approved price. Next: the reservation.'
        else 'Offered ₱' || to_char(p_amount / 100, 'FM999,999,999,999') || ' for ' || coalesce(pname, 'a listing') || '. Waiting for the owner to confirm.'
      end, 1000));
  end if;
  return oid;
end;
$$;

-- Same rights as before: the server only.
revoke all on function public.record_offer(uuid, uuid, bigint, bigint, text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.record_offer(uuid, uuid, bigint, bigint, text, text, text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_offer(uuid, uuid, bigint, bigint, text, text, text) to service_role';
  end if;
end $$;

-- The owner can still confirm another buyer's pending offer, but not a second one on a listing that already has a deal.
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
  if p_confirm then
    perform pg_advisory_xact_lock(hashtext('deal:' || o.property_id::text));
    if exists (select 1 from public.listing_offers where property_id = o.property_id and outcome in ('accepted', 'confirmed') and id <> o.id) then
      return 'deal_taken';
    end if;
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
