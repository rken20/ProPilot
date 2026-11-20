-- HomeFinder AI · The app is for property owners and agents.
--
-- Buyers no longer sign in. Each public listing has a page anyone can open from a
-- shared link; an inquiry sent there becomes a viewing request with no buyer
-- account, so alerts, Google Sheets, Calendar and the Pipeline all work as before.
-- Buyer Finder now matches the business's own leads to its listings, and there are
-- three paid plans for businesses: Basic, Pro and Agency.

-- ---------------------------------------------------------------------------
-- 1. Inquiries from public listing pages
-- ---------------------------------------------------------------------------
alter table public.viewing_requests alter column buyer_id drop not null;
alter table public.viewing_requests
  add column if not exists buyer_email text check (buyer_email is null or char_length(buyer_email) <= 254),
  add column if not exists channel text not null default 'app' check (channel in ('app', 'listing_page'));

-- Public inquiries are inserted by the server only (no policy lets a signed-in
-- user insert one without their own buyer_id). One open inquiry per phone number
-- per listing, and at most 50 a day per listing, so a page can't be flooded.
create or replace function public.viewing_requests_public_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  digits text := regexp_replace(coalesce(new.buyer_phone, ''), '\D', '', 'g');
begin
  if new.buyer_id is not null then
    return new;
  end if;
  if exists (
    select 1 from public.viewing_requests
    where buyer_id is null and property_id = new.property_id
      and regexp_replace(buyer_phone, '\D', '', 'g') = digits
      and status in ('new', 'contacted', 'scheduled')
  ) then
    raise exception 'you already have an open request for this listing';
  end if;
  if (select count(*) from public.viewing_requests
      where buyer_id is null and property_id = new.property_id and created_at > now() - interval '1 day') >= 50 then
    raise exception 'too many viewing requests today';
  end if;
  new.channel := 'listing_page';
  return new;
end;
$$;
drop trigger if exists viewing_requests_public_guard on public.viewing_requests;
create trigger viewing_requests_public_guard
  before insert on public.viewing_requests
  for each row execute function public.viewing_requests_public_guard();

-- A public inquiry joins the lead with the same phone number, if the business has one open.
create or replace function public.viewing_requests_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pname text;
  pid uuid;
begin
  if tg_op = 'INSERT' then
    select name into pname from public.properties where id = new.property_id;
    if new.buyer_id is null then
      select id into pid from public.prospects
      where business_id = new.business_id and stage not in ('won', 'lost') and phone is not null
        and regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.buyer_phone, '\D', '', 'g')
      order by last_activity_at desc
      limit 1;
      if pid is not null then
        update public.prospects
        set last_activity_at = now(), property_id = coalesce(property_id, new.property_id)
        where id = pid;
        new.prospect_id := pid;
      else
        new.prospect_id := public.pipeline_buyer_prospect(new.business_id, null, 'viewing_request', new.buyer_name, new.buyer_phone, new.property_id);
      end if;
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'viewing', left('Sent an inquiry about ' || coalesce(pname, 'a listing') || ' from its public page', 1000));
    else
      new.prospect_id := public.pipeline_buyer_prospect(new.business_id, new.buyer_id, 'viewing_request', new.buyer_name, new.buyer_phone, new.property_id);
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'viewing', left('Asked to view ' || coalesce(pname, 'a listing'), 1000));
    end if;
    return new;
  end if;
  -- Signed-in users can't re-link a request (unlinking happens when a prospect is deleted).
  if auth.uid() is not null and new.prospect_id is not null then
    new.prospect_id := old.prospect_id;
  end if;
  if new.prospect_id is not null and new.status is distinct from old.status then
    update public.prospects set last_activity_at = now() where id = new.prospect_id;
    if new.status in ('scheduled', 'completed') then
      perform public.pipeline_advance(new.prospect_id, 'viewing');
      insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
      values (new.business_id, new.prospect_id, 'viewing',
        case new.status when 'scheduled' then 'Viewing scheduled' else 'Viewing done' end,
        case when public.is_member(new.business_id) then auth.uid() end);
    end if;
  end if;
  return new;
end;
$$;

-- Everyone is an owner or agent now: the 3 buyer accounts set up a business on next sign-in.
update public.profiles set account_type = 'agent', account_type_chosen = true
where account_type = 'buyer' or not account_type_chosen;

-- ---------------------------------------------------------------------------
-- 2. Views of public listing pages, counted per day
-- ---------------------------------------------------------------------------
create table if not exists public.listing_views (
  property_id uuid not null references public.properties (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  day date not null,
  views int not null default 0 check (views >= 0),
  primary key (property_id, day)
);
create index if not exists listing_views_business_day on public.listing_views (business_id, day);
alter table public.listing_views enable row level security;
drop policy if exists listing_views_member_select on public.listing_views;
create policy listing_views_member_select on public.listing_views for select to authenticated
  using (public.is_member(business_id));

create or replace function public.record_listing_view(p_property uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function record_listing_view';
  end if;
  select business_id into biz from public.properties
    where id = p_property and is_public and status in ('available', 'reserved');
  if biz is null then
    return;
  end if;
  insert into public.listing_views (property_id, business_id, day, views)
  values (p_property, biz, (now() at time zone 'Asia/Manila')::date, 1)
  on conflict (property_id, day) do update set views = public.listing_views.views + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rate limits for people without an account (keyed by a hash the server makes)
-- ---------------------------------------------------------------------------
create table if not exists public.anon_rate_limits (
  key text not null check (char_length(key) <= 128),
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table public.anon_rate_limits enable row level security;

create or replace function public.consume_anon_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w int := greatest(p_window_seconds, 1);
  start_at timestamptz := to_timestamp(floor(extract(epoch from now()) / w) * w);
  used int;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function consume_anon_rate_limit';
  end if;
  delete from public.anon_rate_limits where key = p_key and window_start < now() - interval '2 days';
  insert into public.anon_rate_limits (key, window_start, count) values (p_key, start_at, 1)
  on conflict (key, window_start) do update set count = public.anon_rate_limits.count + 1
  returning count into used;
  return used <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Buyer Finder: leads matched to a listing (a month: Basic 5, Pro 20, Agency 60)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_matches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  matched_by uuid references auth.users (id) on delete set null,
  score int check (score between 0 and 100),
  created_at timestamptz not null default now(),
  unique (property_id, prospect_id)
);
create index if not exists listing_matches_business_month on public.listing_matches (business_id, created_at);
create index if not exists listing_matches_prospect on public.listing_matches (prospect_id);
alter table public.listing_matches enable row level security;
drop policy if exists listing_matches_member_select on public.listing_matches;
create policy listing_matches_member_select on public.listing_matches for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

-- Server only. Returns 'added', or why not: 'not_available', 'denied', 'not_open', 'already', 'limit'.
-- p_limit is the plan's monthly limit (null = unlimited, 0 = not included).
create or replace function public.buyer_finder_add(p_property uuid, p_prospect uuid, p_user uuid, p_limit int, p_score int default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  pname text;
  used int;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function buyer_finder_add';
  end if;
  select business_id, name into biz, pname from public.properties where id = p_property and status = 'available';
  if biz is null then
    return 'not_available';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = biz and user_id = p_user and status = 'active' and role in ('owner', 'admin', 'agent')
  ) then
    return 'denied';
  end if;
  if not exists (select 1 from public.prospects where id = p_prospect and business_id = biz and stage not in ('won', 'lost')) then
    return 'not_open';
  end if;

  -- One at a time per business, so the count below can't be raced past.
  perform pg_advisory_xact_lock(hashtext('buyer_finder:' || biz::text));
  if exists (select 1 from public.listing_matches where property_id = p_property and prospect_id = p_prospect) then
    return 'already';
  end if;
  if p_limit is not null then
    select count(*) into used from public.listing_matches
      where business_id = biz
        and created_at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
    if used >= p_limit then
      return 'limit';
    end if;
  end if;

  insert into public.listing_matches (business_id, property_id, prospect_id, matched_by, score)
  values (biz, p_property, p_prospect, p_user, least(greatest(p_score, 0), 100));
  insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
  values (biz, p_prospect, 'task', left('Buyer Finder: a potential buyer for ' || coalesce(pname, 'a listing'), 1000), p_user);
  update public.prospects set last_activity_at = now() where id = p_prospect;
  return 'added';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Three paid plans for businesses: Basic ₱499, Pro ₱999, Agency ₱2,499
-- ---------------------------------------------------------------------------
-- team_members: people in the business, owner included (pending invites count).
-- ai_replies: AI chat and Messenger replies a month; past it, the team is asked to reply.
insert into public.plans (code, name, price_minor, trial_days, sort_order, is_active) values
  ('pro', 'Pro', 99900, 0, 2, true),
  ('agency', 'Agency', 249900, 0, 3, true)
on conflict (code) do update set name = excluded.name, price_minor = excluded.price_minor, sort_order = excluded.sort_order, is_active = true;

insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('free', 'team_members', 1),
  ('free', 'ai_replies', 0),
  ('basic', 'team_members', 2),
  ('basic', 'ai_replies', 3000),
  ('pro', 'ai', null::int),
  ('pro', 'home_finder_buyers', 20),
  ('pro', 'ai_video_generations', 0),
  ('pro', 'team_members', 5),
  ('pro', 'ai_replies', 10000),
  ('agency', 'ai', null::int),
  ('agency', 'home_finder_buyers', 60),
  ('agency', 'ai_video_generations', 0),
  ('agency', 'team_members', 15),
  ('agency', 'ai_replies', 25000)
) as e(code, feature_key, lim) on e.code = p.code
on conflict (plan_id, feature_key) do update set "limit" = excluded."limit";

-- ---------------------------------------------------------------------------
-- 6. The name is HomeFinder AI
-- ---------------------------------------------------------------------------
create or replace function public.prospects_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := case when public.is_member(new.business_id) then auth.uid() end;
begin
  if tg_op = 'INSERT' then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'created', case new.source
      when 'viewing_request' then 'New lead from a listing inquiry'
      when 'messenger' then 'New lead from Messenger'
      when 'app_chat' then 'New lead from a HomeFinder chat'
      else 'Added by hand' end, who);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'stage',
      'Moved to ' || public.prospect_stage_label(new.stage)
        || case when new.stage = 'lost' and new.lost_reason is not null then ': ' || new.lost_reason else '' end,
      who);
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'assigned',
      coalesce('Assigned to ' || (select nullif(full_name, '') from public.profiles where id = new.assigned_to), case when new.assigned_to is null then 'Unassigned' else 'Assigned' end),
      who);
  end if;
  return new;
end;
$$;

update public.prospect_events set body = replace(body, 'Home Finder', 'HomeFinder') where body like '%Home Finder%';

-- ---------------------------------------------------------------------------
-- Who may call what
-- ---------------------------------------------------------------------------
revoke all on function public.viewing_requests_public_guard() from public;
revoke all on function public.record_listing_view(uuid) from public;
revoke all on function public.consume_anon_rate_limit(text, int, int) from public;
revoke all on function public.buyer_finder_add(uuid, uuid, uuid, int, int) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.record_listing_view(uuid) from anon, authenticated';
    execute 'revoke all on function public.consume_anon_rate_limit(text, int, int) from anon, authenticated';
    execute 'revoke all on function public.buyer_finder_add(uuid, uuid, uuid, int, int) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_listing_view(uuid) to service_role';
    execute 'grant execute on function public.consume_anon_rate_limit(text, int, int) to service_role';
    execute 'grant execute on function public.buyer_finder_add(uuid, uuid, uuid, int, int) to service_role';
  end if;
end;
$$;
