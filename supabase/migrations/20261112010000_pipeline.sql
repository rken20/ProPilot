-- ProPilot AI · Sales pipeline and the AI agents' approval queue.
--
-- Every person the team is selling to becomes one prospect that moves through
-- stages (inquiry → qualified → viewing → offer → reservation → won / lost).
-- Prospects are created automatically from viewing requests and chats, or added
-- by hand. AI agents never contact anyone on their own: they propose tasks that
-- a teammate approves, edits or dismisses.
--
-- Who is "the system" here: triggers below run as the table owner, so inserts
-- they make are trusted. Rows written directly by signed-in users (role
-- 'authenticated') get their protected fields reset by prospects_guard.

-- ---------------------------------------------------------------------------
-- Prospects
-- ---------------------------------------------------------------------------
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'buyer' check (kind in ('buyer', 'seller', 'investor')),
  name text check (char_length(name) <= 120),
  phone text check (char_length(phone) <= 40),
  email text check (char_length(email) <= 200),
  -- A ProPilot buyer account. Deleting the account deletes the prospect.
  buyer_id uuid references auth.users (id) on delete cascade,
  source text not null default 'manual' check (source in ('viewing_request', 'messenger', 'app_chat', 'manual')),
  stage text not null default 'inquiry' check (stage in ('inquiry', 'qualified', 'viewing', 'offer', 'reservation', 'won', 'lost')),
  property_id uuid references public.properties (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,
  deal_value_minor bigint check (deal_value_minor >= 0),
  lost_reason text check (char_length(lost_reason) <= 200),
  notes text check (char_length(notes) <= 2000),
  next_step text check (char_length(next_step) <= 200),
  next_step_at timestamptz,
  last_activity_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists prospects_business_buyer on public.prospects (business_id, buyer_id) where buyer_id is not null;
create index if not exists prospects_business_stage on public.prospects (business_id, stage, last_activity_at desc);
alter table public.prospects enable row level security;

create or replace function public.prospect_stage_rank(s text)
returns int
language sql immutable set search_path = public as $$
  select array_position(array['inquiry', 'qualified', 'viewing', 'offer', 'reservation', 'won', 'lost'], s)
$$;

create or replace function public.prospect_stage_label(s text)
returns text
language sql immutable set search_path = public as $$
  select case s
    when 'inquiry' then 'Inquiry' when 'qualified' then 'Qualified' when 'viewing' then 'Viewing'
    when 'offer' then 'Offer' when 'reservation' then 'Reservation' when 'won' then 'Won' when 'lost' then 'Lost'
    else s end
$$;

-- Whether a user is an active member of a business (for checking assignees).
create or replace function public.is_active_member(b uuid, u uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_members where business_id = b and user_id = u and status = 'active')
$$;
revoke execute on function public.is_active_member(uuid, uuid) from public;
grant execute on function public.is_active_member(uuid, uuid) to authenticated;

-- Security invoker on purpose: current_user is 'authenticated' only when a
-- signed-in user writes the row directly.
create or replace function public.prospects_guard()
returns trigger
language plpgsql set search_path = public as $$
declare
  client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if client then
      new.source := 'manual';
      new.buyer_id := null;
      new.created_by := auth.uid();
      new.created_at := now();
      new.last_activity_at := now();
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
    -- Agents may take a lead themselves; only owners and admins assign to others.
    if client and new.assigned_to <> auth.uid()
       and not public.has_role(new.business_id, array['owner', 'admin']::public.business_role[]) then
      raise exception 'only owners and admins can assign leads to someone else';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prospects_guard on public.prospects;
create trigger prospects_guard
  before insert or update on public.prospects
  for each row execute function public.prospects_guard();

drop policy if exists prospects_select on public.prospects;
create policy prospects_select on public.prospects for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));
drop policy if exists prospects_insert on public.prospects;
create policy prospects_insert on public.prospects for insert to authenticated
  with check (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));
drop policy if exists prospects_update on public.prospects;
create policy prospects_update on public.prospects for update to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]))
  with check (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));
drop policy if exists prospects_delete on public.prospects;
create policy prospects_delete on public.prospects for delete to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- Timeline: what happened with each prospect
-- ---------------------------------------------------------------------------
create table if not exists public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'assigned', 'note', 'viewing', 'chat', 'task')),
  body text not null check (char_length(body) between 1 and 1000),
  -- The teammate who did it; null for the system and the AI.
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists prospect_events_prospect on public.prospect_events (prospect_id, created_at desc);
alter table public.prospect_events enable row level security;

drop policy if exists prospect_events_select on public.prospect_events;
create policy prospect_events_select on public.prospect_events for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));
-- Teammates can add notes in their own name; everything else is written by triggers and the server.
drop policy if exists prospect_events_note on public.prospect_events;
create policy prospect_events_note on public.prospect_events for insert to authenticated
  with check (
    kind = 'note'
    and actor = auth.uid()
    and public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[])
    and exists (select 1 from public.prospects p where p.id = prospect_id and p.business_id = prospect_events.business_id)
  );

create or replace function public.prospects_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := case when public.is_member(new.business_id) then auth.uid() end;
begin
  if tg_op = 'INSERT' then
    insert into public.prospect_events (business_id, prospect_id, kind, body, actor)
    values (new.business_id, new.id, 'created', case new.source
      when 'viewing_request' then 'New lead from a viewing request'
      when 'messenger' then 'New lead from Messenger'
      when 'app_chat' then 'New lead from a ProPilot chat'
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

drop trigger if exists prospects_log on public.prospects;
create trigger prospects_log
  after insert or update on public.prospects
  for each row execute function public.prospects_log();

-- ---------------------------------------------------------------------------
-- Feeding the pipeline from viewing requests and chats
-- ---------------------------------------------------------------------------
alter table public.viewing_requests add column if not exists prospect_id uuid references public.prospects (id) on delete set null;
alter table public.messenger_conversations add column if not exists prospect_id uuid references public.prospects (id) on delete set null;
create index if not exists viewing_requests_prospect on public.viewing_requests (prospect_id);
create index if not exists messenger_conversations_prospect on public.messenger_conversations (prospect_id);

-- The prospect for a ProPilot buyer at a business, created on first contact.
-- Security invoker: called from the triggers below (which run as the owner).
-- Called directly by a user, RLS and prospects_guard apply as usual.
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
    -- Someone marked lost who comes back is a fresh inquiry.
    stage = case when public.prospects.stage = 'lost' then 'inquiry' else public.prospects.stage end,
    last_activity_at = now()
  returning id into pid;
  return pid;
end;
$$;
revoke execute on function public.pipeline_buyer_prospect(uuid, uuid, text, text, text, uuid) from public, authenticated;

-- Move a prospect forward to at least `target` (never backwards, never out of won/lost).
create or replace function public.pipeline_advance(pid uuid, target text)
returns void
language sql set search_path = public as $$
  update public.prospects
  set stage = target, last_activity_at = now()
  where id = pid
    and stage not in ('won', 'lost')
    and public.prospect_stage_rank(stage) < public.prospect_stage_rank(target)
$$;
revoke execute on function public.pipeline_advance(uuid, text) from public, authenticated;

create or replace function public.viewing_requests_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pname text;
begin
  if tg_op = 'INSERT' then
    new.prospect_id := public.pipeline_buyer_prospect(new.business_id, new.buyer_id, 'viewing_request', new.buyer_name, new.buyer_phone, new.property_id);
    select name into pname from public.properties where id = new.property_id;
    insert into public.prospect_events (business_id, prospect_id, kind, body)
    values (new.business_id, new.prospect_id, 'viewing', left('Asked to view ' || coalesce(pname, 'a listing'), 1000));
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

-- Runs after viewing_requests_guard (triggers fire in name order), so business_id is already set.
drop trigger if exists viewing_requests_pipeline on public.viewing_requests;
create trigger viewing_requests_pipeline
  before insert or update on public.viewing_requests
  for each row execute function public.viewing_requests_pipeline();

create or replace function public.messenger_conversations_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and new.prospect_id is not null then
    new.prospect_id := old.prospect_id;
  end if;

  if new.prospect_id is null then
    -- Only on first contact, so a prospect the team deleted doesn't come back with the next message.
    if tg_op = 'INSERT' and new.channel = 'app' and new.buyer_id is not null then
      -- A ProPilot buyer who starts a chat is an inquiry straight away.
      new.prospect_id := public.pipeline_buyer_prospect(new.business_id, new.buyer_id, 'app_chat',
        coalesce(new.lead_name, (select full_name from public.profiles where id = new.buyer_id)), new.lead_phone, new.property_id);
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'chat', 'Started a chat in ProPilot');
    elsif new.channel = 'messenger' and new.lead_status <> 'none' and (tg_op = 'INSERT' or old.lead_status = 'none') then
      -- Messenger visitors join the pipeline once the AI or the team records them as a lead.
      insert into public.prospects (business_id, source, name, phone, property_id)
      values (new.business_id, 'messenger', left(coalesce(new.lead_name, new.display_name), 120), left(new.lead_phone, 40), new.property_id)
      returning id into new.prospect_id;
      insert into public.prospect_events (business_id, prospect_id, kind, body)
      values (new.business_id, new.prospect_id, 'chat', 'Asked about a viewing on Messenger');
    end if;
    if new.prospect_id is not null and new.lead_status in ('scheduled', 'closed') then
      perform public.pipeline_advance(new.prospect_id, 'viewing');
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.lead_name, new.lead_phone, new.property_id, new.lead_status)
         is distinct from (old.lead_name, old.lead_phone, old.property_id, old.lead_status) then
    update public.prospects set
      name = coalesce(name, left(new.lead_name, 120)),
      phone = coalesce(phone, left(new.lead_phone, 40)),
      property_id = coalesce(property_id, new.property_id)
    where id = new.prospect_id;
    if new.lead_status is distinct from old.lead_status then
      if new.lead_status = 'new' then
        insert into public.prospect_events (business_id, prospect_id, kind, body)
        values (new.business_id, new.prospect_id, 'chat', 'Asked for a viewing in chat');
        update public.prospects set last_activity_at = now() where id = new.prospect_id;
      elsif new.lead_status = 'scheduled' then
        perform public.pipeline_advance(new.prospect_id, 'viewing');
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messenger_conversations_pipeline on public.messenger_conversations;
create trigger messenger_conversations_pipeline
  before insert or update on public.messenger_conversations
  for each row execute function public.messenger_conversations_pipeline();

-- Any message in a linked chat counts as activity.
create or replace function public.messenger_messages_pipeline()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.prospects p
  set last_activity_at = greatest(p.last_activity_at, new.created_at)
  from public.messenger_conversations c
  where c.id = new.conversation_id and p.id = c.prospect_id;
  return new;
end;
$$;

drop trigger if exists messenger_messages_pipeline on public.messenger_messages;
create trigger messenger_messages_pipeline
  after insert on public.messenger_messages
  for each row execute function public.messenger_messages_pipeline();

-- ---------------------------------------------------------------------------
-- AI agents: settings, the approval queue and the run log
-- ---------------------------------------------------------------------------
create table if not exists public.agent_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled boolean not null default true,
  -- After how many quiet days an open prospect needs a follow-up.
  follow_up_days int not null default 3 check (follow_up_days between 1 and 30),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.agent_settings enable row level security;

drop policy if exists agent_settings_select on public.agent_settings;
create policy agent_settings_select on public.agent_settings for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));
drop policy if exists agent_settings_insert on public.agent_settings;
create policy agent_settings_insert on public.agent_settings for insert to authenticated
  with check (public.has_role(business_id, array['owner', 'admin']::public.business_role[]) and updated_by = auth.uid());
drop policy if exists agent_settings_update on public.agent_settings;
create policy agent_settings_update on public.agent_settings for update to authenticated
  using (public.has_role(business_id, array['owner', 'admin']::public.business_role[]))
  with check (public.has_role(business_id, array['owner', 'admin']::public.business_role[]) and updated_by = auth.uid());

-- What an agent proposes. Nothing leaves ProPilot until a teammate approves it.
create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  prospect_id uuid references public.prospects (id) on delete cascade,
  agent text not null check (agent in ('pipeline', 'qualifier', 'matcher', 'follow_up', 'outreach', 'discovery')),
  -- reminder: something for the team to do. message: a draft to send in the prospect's chat.
  kind text not null check (kind in ('reminder', 'message')),
  title text not null check (char_length(title) between 1 and 160),
  reason text check (char_length(reason) <= 500),
  draft text check (char_length(draft) <= 2000),
  conversation_id uuid references public.messenger_conversations (id) on delete set null,
  -- One open proposal per key, so a daily run doesn't repeat itself.
  dedupe_key text check (char_length(dedupe_key) <= 200),
  status text not null default 'proposed' check (status in ('proposed', 'sending', 'done', 'dismissed', 'failed', 'expired')),
  due_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create unique index if not exists agent_tasks_open_key on public.agent_tasks (business_id, dedupe_key) where status in ('proposed', 'sending');
create index if not exists agent_tasks_business on public.agent_tasks (business_id, status, created_at desc);
create index if not exists agent_tasks_prospect on public.agent_tasks (prospect_id);
alter table public.agent_tasks enable row level security;

drop policy if exists agent_tasks_select on public.agent_tasks;
create policy agent_tasks_select on public.agent_tasks for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  agent text not null check (agent in ('pipeline', 'qualifier', 'matcher', 'follow_up', 'outreach', 'discovery')),
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  summary text check (char_length(summary) <= 500),
  proposed int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_business on public.agent_runs (business_id, started_at desc);
alter table public.agent_runs enable row level security;

drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'agent']::public.business_role[]));

-- Housekeeping, run by the daily job (server only):
-- stale proposals expire after 14 days, old task history and run logs are removed,
-- and early-stage prospects with no activity for 12 months are deleted.
create or replace function public.prune_pipeline()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function prune_pipeline';
  end if;
  update public.agent_tasks set status = 'expired' where status = 'proposed' and created_at < now() - interval '14 days';
  update public.agent_tasks set status = 'failed', error = 'Stopped before it finished' where status = 'sending' and created_at < now() - interval '1 day';
  delete from public.agent_tasks where status not in ('proposed', 'sending') and created_at < now() - interval '180 days';
  delete from public.agent_runs where started_at < now() - interval '90 days';
  delete from public.prospects where stage in ('inquiry', 'qualified', 'lost') and last_activity_at < now() - interval '12 months';
end;
$$;
revoke execute on function public.prune_pipeline() from public, authenticated;

-- ---------------------------------------------------------------------------
-- Bring in the leads that already exist
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  pid uuid;
begin
  for r in select * from public.viewing_requests where prospect_id is null order by created_at loop
    pid := public.pipeline_buyer_prospect(r.business_id, r.buyer_id, 'viewing_request', r.buyer_name, r.buyer_phone, r.property_id);
    update public.viewing_requests set prospect_id = pid where id = r.id;
    update public.prospects set created_at = least(created_at, r.created_at) where id = pid;
    if r.status in ('scheduled', 'completed', 'closed') then
      perform public.pipeline_advance(pid, 'viewing');
    end if;
  end loop;

  for r in
    select * from public.messenger_conversations
    where prospect_id is null and ((channel = 'app' and buyer_id is not null) or (channel = 'messenger' and lead_status <> 'none'))
    order by created_at
  loop
    if r.channel = 'app' then
      pid := public.pipeline_buyer_prospect(r.business_id, r.buyer_id, 'app_chat',
        coalesce(r.lead_name, (select full_name from public.profiles where id = r.buyer_id)), r.lead_phone, r.property_id);
    else
      insert into public.prospects (business_id, source, name, phone, property_id)
      values (r.business_id, 'messenger', left(coalesce(r.lead_name, r.display_name), 120), left(r.lead_phone, 40), r.property_id)
      returning id into pid;
    end if;
    update public.messenger_conversations set prospect_id = pid where id = r.id;
    if r.lead_status in ('scheduled', 'closed') then
      perform public.pipeline_advance(pid, 'viewing');
    end if;
    update public.prospects
    set created_at = least(created_at, r.created_at), last_activity_at = r.last_message_at
    where id = pid;
  end loop;
end;
$$;

-- Supabase also grants new functions to the anonymous role; take the internal ones back.
-- (This includes the older cleanup functions, which only ever revoked from signed-in users.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.pipeline_buyer_prospect(uuid, uuid, text, text, text, uuid) from anon;
    revoke execute on function public.pipeline_advance(uuid, text) from anon;
    revoke execute on function public.prune_pipeline() from anon;
    revoke execute on function public.is_active_member(uuid, uuid) from anon;
    grant execute on function public.is_active_member(uuid, uuid) to service_role;
    revoke execute on function public.prune_messenger() from anon;
    revoke execute on function public.prune_external_listings() from anon;
  end if;
end;
$$;
