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
