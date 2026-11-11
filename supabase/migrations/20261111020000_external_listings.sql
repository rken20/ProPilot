-- ProPilot AI · Listings found on other property sites.
--
-- When a buyer searches other sites, the server (service role) stores the
-- facts of each listing it found: title, price, location, type, size, and the
-- link to the original page. No photos and no contact details are stored:
-- buyers contact the lister on the original page.

create table if not exists public.external_listings (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique
    check (source_url ~ '^https://' and char_length(source_url) <= 600),
  source_name text not null check (char_length(source_name) between 1 and 60),
  title text not null check (char_length(title) between 1 and 160),
  type public.property_type,
  location text check (char_length(location) <= 160),
  price_minor bigint check (price_minor >= 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  bedrooms smallint check (bedrooms between 0 and 50),
  floor_area_sqm numeric(10, 2) check (floor_area_sqm > 0 and floor_area_sqm < 1000000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.external_listings enable row level security;

-- Signed-in users can read them. Only the server writes them.
drop policy if exists external_listings_select on public.external_listings;
create policy external_listings_select on public.external_listings
  for select to authenticated using (true);

-- Which listings a search returned, cached so the same search within a day
-- doesn't run (and cost) again. Server only: no client policies.
create table if not exists public.external_searches (
  query_key text not null check (char_length(query_key) between 1 and 200),
  listing_id uuid not null references public.external_listings (id) on delete cascade,
  rank smallint not null default 0,
  searched_at timestamptz not null default now(),
  primary key (query_key, listing_id)
);
create index if not exists external_searches_key_time on public.external_searches (query_key, searched_at desc);
alter table public.external_searches enable row level security;

-- A buyer's saved listings from other sites. Each buyer sees only their own.
create table if not exists public.external_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid not null references public.external_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table public.external_favorites enable row level security;

drop policy if exists external_favorites_select on public.external_favorites;
create policy external_favorites_select on public.external_favorites
  for select to authenticated using (user_id = auth.uid());
drop policy if exists external_favorites_insert on public.external_favorites;
create policy external_favorites_insert on public.external_favorites
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists external_favorites_delete on public.external_favorites;
create policy external_favorites_delete on public.external_favorites
  for delete to authenticated using (user_id = auth.uid());

-- Retention: search hits last 7 days; a listing nobody has saved is removed
-- 30 days after it was last seen. The server calls this after each search.
create or replace function public.prune_external_listings()
returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Server only: a signed-in user's request carries a user id, the service role's doesn't.
  if auth.uid() is not null then
    raise exception 'permission denied for function prune_external_listings';
  end if;
  delete from public.external_searches where searched_at < now() - interval '7 days';
  delete from public.external_listings l
  where l.last_seen_at < now() - interval '30 days'
    and not exists (select 1 from public.external_favorites f where f.listing_id = l.id);
end;
$$;
revoke execute on function public.prune_external_listings() from public, authenticated;
