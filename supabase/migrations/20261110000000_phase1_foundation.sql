-- ProPilot AI · Phase 1 foundation
-- Tenancy, roles, plans, properties and audit log, with row-level security.
--
-- Rule: every tenant-owned table has a business_id, and RLS limits each row to
-- active members of that business. The service role (server only) bypasses RLS
-- for webhooks and admin jobs; it is never exposed to the browser or the app.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.business_role as enum ('owner', 'admin', 'agent', 'marketing');
create type public.member_status as enum ('active', 'deactivated');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.business_type as enum (
  'independent_agent', 'brokerage', 'developer', 'property_management', 'other'
);
create type public.property_type as enum (
  'condominium', 'house_and_lot', 'townhouse', 'lot', 'commercial', 'other'
);
create type public.property_status as enum ('available', 'reserved', 'sold', 'archived');
create type public.billing_interval as enum ('month', 'year');

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_path text,
  status public.account_status not null default 'active',
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Businesses and membership
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  type public.business_type not null default 'independent_agent',
  email text,
  phone text,
  address text,
  logo_path text,
  country char(2) not null default 'PH',
  currency char(3) not null default 'PHP',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.business_role not null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email text not null,
  role public.business_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_business_idx on public.invitations (business_id);

-- ---------------------------------------------------------------------------
-- Plans (platform-wide, edited by Super Admin; prices are never hardcoded)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null default 'PHP',
  billing_interval public.billing_interval not null default 'month',
  trial_days integer not null default 0 check (trial_days >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.plan_entitlements (
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null,
  "limit" integer check ("limit" is null or "limit" >= 0), -- null = unlimited
  primary key (plan_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  type public.property_type not null,
  location text not null,
  price_minor bigint not null check (price_minor >= 0),
  reservation_fee_minor bigint check (reservation_fee_minor >= 0),
  currency char(3) not null default 'PHP',
  status public.property_status not null default 'available',
  description text,
  financing jsonb not null default '{}'::jsonb,
  assigned_agent_id uuid references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_business_idx on public.properties (business_id);

create table public.property_media (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('photo', 'video')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index property_media_property_idx on public.property_media (property_id);

-- ---------------------------------------------------------------------------
-- Audit log (append-only from the client's point of view)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_business_idx on public.audit_logs (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse into RLS)
-- ---------------------------------------------------------------------------
create or replace function public.member_role(b uuid)
returns public.business_role
language sql stable security definer set search_path = public as $$
  select role from public.business_members
  where business_id = b and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_member(b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.member_role(b) is not null
$$;

create or replace function public.has_role(b uuid, roles public.business_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(b) = any(roles), false)
$$;

-- Creating a business and its owner membership happens atomically here, so a
-- user can never create a membership row for someone else's business.
create or replace function public.create_business(
  p_name text,
  p_type public.business_type default 'independent_agent'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.businesses (name, type, created_by)
  values (p_name, p_type, auth.uid())
  returning id into new_id;
  insert into public.business_members (business_id, user_id, role)
  values (new_id, auth.uid(), 'owner');
  insert into public.audit_logs (business_id, actor_id, action, target_type, target_id)
  values (new_id, auth.uid(), 'business.create', 'business', new_id::text);
  return new_id;
end;
$$;

-- New auth users get a profile row automatically.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.invitations enable row level security;
alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.properties enable row level security;
alter table public.property_media enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: you see yourself and people in your businesses; you edit only yourself.
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_superadmin = false);

-- Businesses: members read; owner/admin update; creation goes through create_business().
create policy businesses_select on public.businesses for select using (public.is_member(id));
create policy businesses_update on public.businesses for update
  using (public.has_role(id, array['owner','admin']::public.business_role[]))
  with check (public.has_role(id, array['owner','admin']::public.business_role[]));
create policy businesses_delete on public.businesses for delete
  using (public.has_role(id, array['owner']::public.business_role[]));

-- Members: members read the roster; owner/admin manage it.
create policy members_select on public.business_members for select using (public.is_member(business_id));
create policy members_update on public.business_members for update
  using (public.has_role(business_id, array['owner','admin']::public.business_role[]))
  with check (public.has_role(business_id, array['owner','admin']::public.business_role[]));
create policy members_delete on public.business_members for delete
  using (public.has_role(business_id, array['owner','admin']::public.business_role[]));

-- Invitations: owner/admin only.
create policy invitations_all on public.invitations for all
  using (public.has_role(business_id, array['owner','admin']::public.business_role[]))
  with check (public.has_role(business_id, array['owner','admin']::public.business_role[]));

-- Plans: anyone signed in can read active plans (pricing page); writes are server-side only.
create policy plans_select on public.plans for select using (is_active);
create policy plan_entitlements_select on public.plan_entitlements for select using (true);

-- Properties: members read; owner/admin create and delete; agents update ones assigned to them.
create policy properties_select on public.properties for select using (public.is_member(business_id));
create policy properties_insert on public.properties for insert with check (
  public.has_role(business_id, array['owner','admin']::public.business_role[])
  and created_by = auth.uid()
);
create policy properties_update on public.properties for update
  using (
    public.has_role(business_id, array['owner','admin']::public.business_role[])
    or (public.has_role(business_id, array['agent']::public.business_role[]) and assigned_agent_id = auth.uid())
  )
  with check (public.is_member(business_id));
create policy properties_delete on public.properties for delete
  using (public.has_role(business_id, array['owner','admin']::public.business_role[]));

create policy property_media_select on public.property_media for select using (public.is_member(business_id));
create policy property_media_write on public.property_media for all
  using (public.has_role(business_id, array['owner','admin']::public.business_role[]))
  with check (public.has_role(business_id, array['owner','admin']::public.business_role[]));

-- Audit log: owner/admin read; nobody writes from the client (server and
-- security-definer functions only).
create policy audit_logs_select on public.audit_logs for select
  using (business_id is not null and public.has_role(business_id, array['owner','admin']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- Seed plans (prices are placeholders for the beta; edit in Super Admin later)
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, price_minor, trial_days, sort_order) values
  ('free_trial',   'Free Trial',   0, 14, 0),
  ('starter',      'Starter',      0, 0,  1),
  ('professional', 'Professional', 0, 0,  2);

insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('free_trial',   'seats', 1),   ('free_trial',   'properties', 5),
  ('free_trial',   'facebook_pages', 1), ('free_trial', 'chatbot_conversations', 50),
  ('starter',      'seats', 2),   ('starter',      'properties', 25),
  ('starter',      'facebook_pages', 1), ('starter', 'chatbot_conversations', 500),
  ('professional', 'seats', 5),   ('professional', 'properties', null),
  ('professional', 'facebook_pages', 3), ('professional', 'chatbot_conversations', 3000),
  ('professional', 'ai_reports', 30)
) as e(code, feature_key, lim) on e.code = p.code;
