-- ProPilot AI · What the Reports page needs that wasn't recorded yet.
--
-- 1. Viewing requests: when the team first responded, who did, and when it closed.
--    Set by a trigger from status changes, so nobody can type them in.
-- 2. Properties: when a listing was marked sold (days on the market).
-- 3. A count of questions buyers ask the listing assistant (no message text).

alter table public.viewing_requests
  add column if not exists first_response_at timestamptz,
  add column if not exists responded_by uuid references auth.users (id) on delete set null,
  add column if not exists closed_at timestamptz;

create or replace function public.viewing_requests_track()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.first_response_at := null;
    new.responded_by := null;
    new.closed_at := null;
    return new;
  end if;
  -- Never taken from the client.
  new.first_response_at := old.first_response_at;
  new.responded_by := old.responded_by;
  new.closed_at := old.closed_at;
  if new.status is distinct from old.status then
    if old.status = 'new' and old.first_response_at is null and auth.uid() is not null and public.is_member(old.business_id) then
      new.first_response_at := now();
      new.responded_by := auth.uid();
    end if;
    if new.status = 'closed' then
      new.closed_at := coalesce(old.closed_at, now());
    elsif old.status = 'closed' then
      new.closed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists viewing_requests_track on public.viewing_requests;
create trigger viewing_requests_track
  before insert or update on public.viewing_requests
  for each row execute function public.viewing_requests_track();

alter table public.properties add column if not exists sold_at timestamptz;

create or replace function public.properties_track_sold()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.sold_at := case when new.status = 'sold' then now() end;
  elsif new.status is distinct from old.status then
    new.sold_at := case when new.status = 'sold' then now() end;
  else
    new.sold_at := old.sold_at;
  end if;
  return new;
end;
$$;

drop trigger if exists properties_track_sold on public.properties;
create trigger properties_track_sold
  before insert or update on public.properties
  for each row execute function public.properties_track_sold();

create table if not exists public.listing_question_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists listing_question_events_business on public.listing_question_events (business_id, created_at);
alter table public.listing_question_events enable row level security;

drop policy if exists listing_question_events_select on public.listing_question_events;
create policy listing_question_events_select on public.listing_question_events
  for select to authenticated using (public.is_member(business_id));
