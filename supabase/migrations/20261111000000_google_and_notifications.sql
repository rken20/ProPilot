-- ProPilot AI · Lead emails, viewing times, and Connect Google.

-- ---------------------------------------------------------------------------
-- Viewing time set by the agent, and the Google Calendar event made for it.
-- ---------------------------------------------------------------------------
alter table public.viewing_requests add column if not exists scheduled_at timestamptz;
alter table public.viewing_requests add column if not exists calendar_event_id text;

-- Buyers may only cancel; they can't set the viewing time or the event either.
create or replace function public.viewing_requests_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_public_listing(new.property_id) then
      raise exception 'this listing is not available for viewings';
    end if;
    select business_id into new.business_id from public.properties where id = new.property_id;
    new.status := 'new';
    new.agent_note := null;
    new.scheduled_at := null;
    new.calendar_event_id := null;
    return new;
  end if;

  if auth.uid() is not null and new.buyer_id = auth.uid() and not public.is_member(old.business_id) then
    if new.status <> 'closed'
       or new.agent_note is distinct from old.agent_note
       or new.scheduled_at is distinct from old.scheduled_at
       or new.calendar_event_id is distinct from old.calendar_event_id then
      raise exception 'buyers can only cancel a request';
    end if;
  end if;
  new.business_id := old.business_id;
  new.property_id := old.property_id;
  new.buyer_id := old.buyer_id;
  if public.is_member(old.business_id) then
    new.buyer_name := old.buyer_name;
    new.buyer_phone := old.buyer_phone;
    new.preferred_date := old.preferred_date;
    new.budget_note := old.budget_note;
    new.message := old.message;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Google connections: one per user. Tokens are encrypted by the app and this
-- table has no client policies at all: only the server (service role) reads it.
-- ---------------------------------------------------------------------------
create table if not exists public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,
  scopes text[] not null default '{}',
  calendar_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_connections enable row level security;

-- What the signed-in user may know about their own connection (no tokens).
create or replace function public.my_google_connection()
returns table (google_email text, scopes text[], has_calendar boolean, connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select google_email, scopes, calendar_id is not null, created_at
  from public.google_connections where user_id = auth.uid()
$$;
grant execute on function public.my_google_connection() to authenticated;

-- ---------------------------------------------------------------------------
-- Per-business integration settings (written by the server only).
-- ---------------------------------------------------------------------------
create table if not exists public.business_integrations (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  sheets_user_id uuid references auth.users (id) on delete set null,
  spreadsheet_id text,
  spreadsheet_url text,
  sheets_synced_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.business_integrations enable row level security;

drop policy if exists business_integrations_select on public.business_integrations;
create policy business_integrations_select on public.business_integrations for select
  using (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]));
