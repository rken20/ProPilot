-- ProPilot AI · Lead qualification.
--
-- Buyers can say what they're looking for (budget, areas, timing, financing).
-- They choose whether businesses they've contacted may see it. Each prospect
-- gets the known facts, an AI score (hot / warm / cold) with a reason, and what
-- is still missing. Only the server writes the score; the team can correct the
-- facts, and the AI then leaves those alone.

-- ---------------------------------------------------------------------------
-- What a buyer is looking for (their own record)
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  budget_min_minor bigint check (budget_min_minor >= 0),
  budget_max_minor bigint check (budget_max_minor >= 0),
  areas text[] not null default '{}' check (cardinality(areas) <= 5 and char_length(array_to_string(areas, '|')) <= 300),
  property_types text[] not null default '{}'
    check (property_types <@ array['condominium', 'house_and_lot', 'townhouse', 'lot', 'commercial', 'other']),
  bedrooms_min int check (bedrooms_min between 0 and 10),
  timeline text check (timeline in ('asap', '1_3_months', '3_6_months', '6_plus_months', 'browsing')),
  financing text check (financing in ('cash', 'bank', 'pagibig', 'in_house', 'unsure')),
  must_haves text check (char_length(must_haves) <= 300),
  -- Whether businesses the buyer has contacted may see this.
  share_with_agents boolean not null default true,
  updated_at timestamptz not null default now(),
  check (budget_min_minor is null or budget_max_minor is null or budget_min_minor <= budget_max_minor)
);
alter table public.buyer_preferences enable row level security;

drop policy if exists buyer_preferences_own on public.buyer_preferences;
create policy buyer_preferences_own on public.buyer_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Qualification on each prospect
-- ---------------------------------------------------------------------------
alter table public.prospects
  add column if not exists budget_min_minor bigint check (budget_min_minor >= 0),
  add column if not exists budget_max_minor bigint check (budget_max_minor >= 0),
  add column if not exists areas text[] not null default '{}' check (cardinality(areas) <= 5 and char_length(array_to_string(areas, '|')) <= 300),
  add column if not exists property_types text[] not null default '{}'
    check (property_types <@ array['condominium', 'house_and_lot', 'townhouse', 'lot', 'commercial', 'other']),
  add column if not exists timeline text check (timeline in ('asap', '1_3_months', '3_6_months', '6_plus_months', 'browsing')),
  add column if not exists financing text check (financing in ('cash', 'bank', 'pagibig', 'in_house', 'unsure')),
  -- Who set the facts last. When the team corrects them, the AI stops overwriting them.
  add column if not exists facts_by text check (facts_by in ('ai', 'team')),
  add column if not exists score int check (score between 0 and 100),
  add column if not exists temperature text check (temperature in ('hot', 'warm', 'cold')),
  add column if not exists score_reason text check (char_length(score_reason) <= 500),
  add column if not exists missing text[] not null default '{}'
    check (missing <@ array['budget', 'area', 'property_type', 'timeline', 'financing']),
  add column if not exists qualified_at timestamptz,
  -- Set when something new happens (a message, a request, a note, new preferences).
  add column if not exists needs_qualify boolean not null default true;
create index if not exists prospects_needs_qualify on public.prospects (business_id) where needs_qualify;

-- The guard from the pipeline migration, now also protecting the score.
create or replace function public.prospects_guard()
returns trigger
language plpgsql set search_path = public as $$
declare
  client boolean := current_user in ('authenticated', 'anon');
  facts_changed boolean;
begin
  if tg_op = 'INSERT' then
    if client then
      new.source := 'manual';
      new.buyer_id := null;
      new.created_by := auth.uid();
      new.created_at := now();
      new.last_activity_at := now();
      new.score := null;
      new.temperature := null;
      new.score_reason := null;
      new.missing := '{}';
      new.qualified_at := null;
      new.needs_qualify := true;
      new.facts_by := case
        when new.budget_min_minor is not null or new.budget_max_minor is not null or cardinality(new.areas) > 0
          or cardinality(new.property_types) > 0 or new.timeline is not null or new.financing is not null then 'team' end;
    end if;
    new.stage_changed_at := now();
    new.closed_at := case when new.stage in ('won', 'lost') then now() end;
    new.updated_at := now();
  else
    new.business_id := old.business_id;
    if client then
      new.buyer_id := old.buyer_id;
      new.source := old.source;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
      new.last_activity_at := old.last_activity_at;
      new.score := old.score;
      new.temperature := old.temperature;
      new.score_reason := old.score_reason;
      new.missing := old.missing;
      new.qualified_at := old.qualified_at;
      facts_changed := (new.budget_min_minor, new.budget_max_minor, new.areas, new.property_types, new.timeline, new.financing)
        is distinct from (old.budget_min_minor, old.budget_max_minor, old.areas, old.property_types, old.timeline, old.financing);
      if facts_changed then
        new.facts_by := 'team';
        new.needs_qualify := true;
      elsif new.facts_by is distinct from old.facts_by and new.facts_by is distinct from 'ai' then
        -- The team can hand the facts back to the AI, nothing else.
        new.facts_by := old.facts_by;
      end if;
      -- The team can ask for a fresh check but can't mark a lead as checked.
      if not new.needs_qualify then
        new.needs_qualify := old.needs_qualify;
      end if;
    end if;
    if new.stage is distinct from old.stage then
      new.stage_changed_at := now();
      new.closed_at := case when new.stage in ('won', 'lost') then now() end;
      if client then
        new.last_activity_at := now();
      end if;
    else
      new.stage_changed_at := old.stage_changed_at;
      new.closed_at := old.closed_at;
    end if;
    new.updated_at := now();
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    if not public.is_active_member(new.business_id, new.assigned_to) then
      raise exception 'that person is not on this team';
    end if;
    if client and new.assigned_to <> auth.uid()
       and not public.has_role(new.business_id, array['owner', 'admin']::public.business_role[]) then
      raise exception 'only owners and admins can assign leads to someone else';
    end if;
  end if;
  return new;
end;
$$;

-- New buyer contact means there's something new to read.
create or replace function public.pipeline_buyer_prospect(b uuid, buyer uuid, src text, nm text, ph text, prop uuid)
returns uuid
language plpgsql set search_path = public as $$
declare
  pid uuid;
begin
  insert into public.prospects (business_id, buyer_id, source, name, phone, property_id)
  values (b, buyer, src, left(nullif(trim(nm), ''), 120), left(nullif(trim(ph), ''), 40), prop)
  on conflict (business_id, buyer_id) where buyer_id is not null do update set
    name = coalesce(public.prospects.name, excluded.name),
    phone = coalesce(public.prospects.phone, excluded.phone),
    property_id = coalesce(public.prospects.property_id, excluded.property_id),
    stage = case when public.prospects.stage = 'lost' then 'inquiry' else public.prospects.stage end,
    last_activity_at = now(),
    needs_qualify = true
  returning id into pid;
  return pid;
end;
$$;
revoke execute on function public.pipeline_buyer_prospect(uuid, uuid, text, text, text, uuid) from public, authenticated;

create or replace function public.messenger_messages_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.prospects p
  set last_activity_at = greatest(p.last_activity_at, new.created_at),
      needs_qualify = p.needs_qualify or new.sender = 'buyer'
  from public.messenger_conversations c
  where c.id = new.conversation_id and p.id = c.prospect_id;
  return new;
end;
$$;

create or replace function public.prospect_events_qualify()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'note' then
    update public.prospects set needs_qualify = true where id = new.prospect_id and not needs_qualify;
  end if;
  return new;
end;
$$;

drop trigger if exists prospect_events_qualify on public.prospect_events;
create trigger prospect_events_qualify
  after insert on public.prospect_events
  for each row execute function public.prospect_events_qualify();

create or replace function public.buyer_preferences_touch()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  update public.prospects set needs_qualify = true where buyer_id = new.user_id and not needs_qualify;
  return new;
end;
$$;

drop trigger if exists buyer_preferences_touch on public.buyer_preferences;
create trigger buyer_preferences_touch
  before insert or update on public.buyer_preferences
  for each row execute function public.buyer_preferences_touch();

-- A buyer's shared preferences, for the team of a business they've contacted.
create or replace function public.prospect_buyer_preferences(p_prospect uuid)
returns table (
  budget_min_minor bigint, budget_max_minor bigint, areas text[], property_types text[], bedrooms_min int,
  timeline text, financing text, must_haves text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select bp.budget_min_minor, bp.budget_max_minor, bp.areas, bp.property_types, bp.bedrooms_min,
         bp.timeline, bp.financing, bp.must_haves, bp.updated_at
  from public.prospects p
  join public.buyer_preferences bp on bp.user_id = p.buyer_id
  where p.id = p_prospect
    and bp.share_with_agents
    and public.has_role(p.business_id, array['owner', 'admin', 'agent']::public.business_role[])
$$;
revoke execute on function public.prospect_buyer_preferences(uuid) from public;
grant execute on function public.prospect_buyer_preferences(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Agents can now suggest moving a lead to another stage
-- ---------------------------------------------------------------------------
alter table public.agent_tasks drop constraint if exists agent_tasks_kind_check;
alter table public.agent_tasks add constraint agent_tasks_kind_check check (kind in ('reminder', 'message', 'stage'));
alter table public.agent_tasks add column if not exists proposed_stage text
  check (proposed_stage in ('inquiry', 'qualified', 'viewing', 'offer', 'reservation', 'won', 'lost'));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.prospect_buyer_preferences(uuid) from anon;
    revoke execute on function public.pipeline_buyer_prospect(uuid, uuid, text, text, text, uuid) from anon;
  end if;
end;
$$;
