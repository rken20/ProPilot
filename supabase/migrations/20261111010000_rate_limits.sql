-- ProPilot AI · Rate limits, kept in Postgres so every server instance shares them.

create table if not exists public.rate_limit_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null check (char_length(bucket) between 1 and 64),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limit_counters enable row level security;
-- No policies: only the function below touches this table.

-- Count one use of `p_bucket` for the signed-in user in the current window and
-- say whether it is within `p_limit`. The server picks the limits.
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  w integer := greatest(p_window_seconds, 1);
  start_at timestamptz := to_timestamp(floor(extract(epoch from now()) / w) * w);
  used integer;
begin
  if uid is null then
    return false;
  end if;
  insert into public.rate_limit_counters (user_id, bucket, window_start, count)
  values (uid, p_bucket, start_at, 1)
  on conflict (user_id, bucket, window_start) do update set count = rate_limit_counters.count + 1
  returning count into used;
  delete from public.rate_limit_counters where user_id = uid and window_start < now() - interval '2 days';
  return used <= p_limit;
end;
$$;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- Viewing requests: at most 10 a day per buyer, and one open request per listing,
-- so a single account can't flood an agency's inbox.
create or replace function public.viewing_requests_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_public_listing(new.property_id) then
      raise exception 'this listing is not available for viewings';
    end if;
    if exists (
      select 1 from public.viewing_requests
      where buyer_id = new.buyer_id and property_id = new.property_id
        and status in ('new', 'contacted', 'scheduled')
    ) then
      raise exception 'you already have an open request for this listing';
    end if;
    if (select count(*) from public.viewing_requests
        where buyer_id = new.buyer_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'too many viewing requests today';
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
