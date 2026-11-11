-- ProPilot AI · Run once in Supabase → SQL Editor. Safe to run again.
-- Adds: listings from other sites (buyer search) and Facebook Pages.

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

-- ProPilot AI · Facebook Pages connected to a business.
--
-- An owner or admin connects the business's Facebook Pages. ProPilot stores
-- each Page's access token encrypted (AES-256-GCM, key outside the database)
-- and uses it to read the Page's own posts (to turn them into listings) and to
-- publish listings to the Page. Tokens are server-only: no client policies.

create table if not exists public.facebook_pages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  page_id text not null check (page_id ~ '^[0-9]{1,30}$'),
  name text not null check (char_length(name) between 1 and 200),
  page_token_enc text not null,
  tasks text[] not null default '{}',
  -- App-scoped Facebook user ID of the person who connected the Page, so a
  -- data deletion request from Meta can find what to delete.
  fb_user_id text not null check (fb_user_id ~ '^[0-9]{1,30}$'),
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  unique (business_id, page_id)
);
create index if not exists facebook_pages_fb_user on public.facebook_pages (fb_user_id);
alter table public.facebook_pages enable row level security;

-- What members may know about the business's Pages (never the tokens).
create or replace function public.business_facebook_pages(p_business_id uuid)
returns table (id uuid, page_id text, name text, tasks text[], connected_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, page_id, name, tasks, connected_at
  from public.facebook_pages
  where business_id = p_business_id and public.is_member(p_business_id)
  order by name
$$;
grant execute on function public.business_facebook_pages(uuid) to authenticated;

-- A log of what ProPilot posted to Facebook. Written by the server; members read.
create table if not exists public.facebook_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  page_id text not null,
  page_name text not null,
  kind text not null check (kind in ('text', 'photos', 'video')),
  status text not null check (status in ('published', 'failed')),
  fb_post_id text,
  permalink_url text check (permalink_url is null or permalink_url ~ '^https://'),
  error text check (char_length(error) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists facebook_posts_property on public.facebook_posts (property_id, created_at desc);
alter table public.facebook_posts enable row level security;

drop policy if exists facebook_posts_select on public.facebook_posts;
create policy facebook_posts_select on public.facebook_posts
  for select to authenticated using (public.is_member(business_id));

-- Meta's data deletion requests and their status (server only).
create table if not exists public.meta_deletion_requests (
  confirmation_code text primary key check (char_length(confirmation_code) between 8 and 64),
  fb_user_id text not null,
  pages_deleted integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.meta_deletion_requests enable row level security;
