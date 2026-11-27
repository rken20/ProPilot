-- MyHomeSeller · Boosting a Facebook video from the app (video ads plan, stage 2).
--
-- Owner's decisions, 27 Nov 2026: Pro and Agency only; at most ₱1,000 a day and ₱10,000 per
-- boost; the app suggests ₱300 a day for 5 days within about 20 km; every boost is approved by
-- the business owner in the app before anything is created; ads aim for Messenger chats.
-- The ad money goes from the business's own Meta ad account to Meta. MyHomeSeller never
-- handles it.

-- ---------------------------------------------------------------------------
-- 1. The Facebook sign-in that may run ads, and the chosen ad account (server only)
-- ---------------------------------------------------------------------------
-- The long-lived user token is kept only when the person granted the ad permissions. It is
-- encrypted like the Page tokens (AES-256-GCM, key outside the database) and lasts about 60
-- days; after that the app asks for Facebook to be connected again.
create table if not exists public.meta_ad_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  fb_user_id text not null check (fb_user_id ~ '^[0-9]{1,30}$'),
  user_token_enc text not null,
  token_expires_at timestamptz not null,
  ad_account_id text check (ad_account_id is null or ad_account_id ~ '^[0-9]{1,30}$'),
  ad_account_name text check (ad_account_name is null or char_length(ad_account_name) <= 200),
  connected_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists meta_ad_connections_fb_user on public.meta_ad_connections (fb_user_id);
-- Tokens are server-only: row-level security on and no client policies, like facebook_pages.
alter table public.meta_ad_connections enable row level security;
revoke all on table public.meta_ad_connections from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Boosts
-- ---------------------------------------------------------------------------
create table if not exists public.ad_boosts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  facebook_post_id uuid not null references public.facebook_posts (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  ad_account_id text not null check (ad_account_id ~ '^[0-9]{1,30}$'),
  campaign_id text check (campaign_id is null or campaign_id ~ '^[0-9]{1,30}$'),
  adset_id text check (adset_id is null or adset_id ~ '^[0-9]{1,30}$'),
  creative_id text check (creative_id is null or creative_id ~ '^[0-9]{1,30}$'),
  ad_id text check (ad_id is null or ad_id ~ '^[0-9]{1,30}$'),
  -- Owner's limits: ₱100 to ₱1,000 a day, 1 to 14 days, at most ₱10,000 in all (centavos).
  daily_budget_minor int not null check (daily_budget_minor between 10000 and 100000),
  days int not null check (days between 1 and 14),
  total_minor int not null constraint ad_boosts_total_minor_check check (total_minor = daily_budget_minor * days and total_minor <= 1000000),
  radius_km int not null check (radius_km between 15 and 50),
  area_label text not null check (char_length(area_label) between 1 and 200),
  status text not null default 'creating' check (status in ('creating', 'active', 'stopped', 'finished', 'failed')),
  error text check (char_length(error) <= 300),
  approved_by uuid not null references auth.users (id) on delete restrict,
  approved_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  stopped_by uuid references auth.users (id) on delete set null,
  stopped_at timestamptz,
  -- Results as Meta last reported them.
  spend_minor bigint check (spend_minor is null or spend_minor >= 0),
  impressions bigint check (impressions is null or impressions >= 0),
  reach bigint check (reach is null or reach >= 0),
  chats int check (chats is null or chats >= 0),
  results_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ad_boosts_business on public.ad_boosts (business_id, created_at desc);
-- One boost at a time per post.
create unique index if not exists ad_boosts_one_running on public.ad_boosts (facebook_post_id) where status in ('creating', 'active');
alter table public.ad_boosts enable row level security;

-- The team can see boosts and their results; only the server writes them.
drop policy if exists ad_boosts_select on public.ad_boosts;
create policy ad_boosts_select on public.ad_boosts for select to authenticated
  using (public.has_role(business_id, array['owner', 'admin', 'marketing']::public.business_role[]));
revoke all on table public.ad_boosts from authenticated;
grant select on table public.ad_boosts to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.meta_ad_connections from anon;
    revoke all on table public.ad_boosts from anon;
  end if;
end;
$$;
