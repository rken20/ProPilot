-- PropPilot AI · Buyers: account type, public listings, favorites, viewing requests.

-- ---------------------------------------------------------------------------
-- Account type: chosen at sign-up. Agents work inside a business; buyers browse.
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('agent', 'buyer');

alter table public.profiles add column account_type public.account_type not null default 'agent';

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    case when new.raw_user_meta_data ->> 'account_type' = 'buyer' then 'buyer'::public.account_type
         else 'agent'::public.account_type end
  );
  return new;
end;
$$;

-- Users can't change their own account type through a profile update.
create or replace function public.my_account_type()
returns public.account_type
language sql stable security definer set search_path = public as $$
  select account_type from public.profiles where id = auth.uid()
$$;

drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_superadmin = false
    and account_type = public.my_account_type()
  );

-- ---------------------------------------------------------------------------
-- Listing visibility: off by default; the agent turns it on per property.
-- ---------------------------------------------------------------------------
alter table public.properties add column is_public boolean not null default false;
create index properties_public_idx on public.properties (is_public, status) where is_public;

-- Buyers never read the properties table directly. These functions return only
-- buyer-safe fields of listings that are public and not sold or archived.
create or replace function public.search_listings(
  p_query text default null,
  p_type public.property_type default null,
  p_max_price bigint default null,
  p_limit int default 48
)
returns table (
  id uuid, name text, type public.property_type, location text, price_minor bigint,
  reservation_fee_minor bigint, currency char(3), status public.property_status,
  description text, financing jsonb, business_name text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.type, p.location, p.price_minor, p.reservation_fee_minor, p.currency, p.status,
         p.description, p.financing, b.name, p.updated_at
  from public.properties p
  join public.businesses b on b.id = p.business_id
  where auth.uid() is not null
    and p.is_public
    and p.status in ('available', 'reserved')
    and (p_query is null or p_query = '' or p.name ilike '%' || p_query || '%' or p.location ilike '%' || p_query || '%')
    and (p_type is null or p.type = p_type)
    and (p_max_price is null or p.price_minor <= p_max_price)
  order by (p.status = 'available') desc, p.updated_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.get_listing(p_id uuid)
returns table (
  id uuid, name text, type public.property_type, location text, price_minor bigint,
  reservation_fee_minor bigint, currency char(3), status public.property_status,
  description text, financing jsonb, business_name text, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.type, p.location, p.price_minor, p.reservation_fee_minor, p.currency, p.status,
         p.description, p.financing, b.name, p.updated_at
  from public.properties p join public.businesses b on b.id = p.business_id
  where p.id = p_id and auth.uid() is not null and p.is_public and p.status in ('available', 'reserved')
$$;

-- ---------------------------------------------------------------------------
-- Favorites: a buyer's private shortlist.
-- ---------------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, property_id)
);
alter table public.favorites enable row level security;

create or replace function public.is_public_listing(p uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.properties
    where id = p and is_public and status in ('available', 'reserved')
  )
$$;

create policy favorites_select on public.favorites for select using (user_id = auth.uid());
create policy favorites_insert on public.favorites for insert
  with check (user_id = auth.uid() and public.is_public_listing(property_id));
create policy favorites_delete on public.favorites for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Viewing requests: a buyer asks to see a listing; it becomes the agent's lead.
-- ---------------------------------------------------------------------------
create type public.viewing_status as enum ('new', 'contacted', 'scheduled', 'completed', 'closed');

create table public.viewing_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  buyer_name text not null check (char_length(buyer_name) between 2 and 120),
  buyer_phone text not null check (char_length(buyer_phone) between 7 and 30),
  preferred_date date,
  budget_note text check (char_length(budget_note) <= 200),
  message text check (char_length(message) <= 1000),
  status public.viewing_status not null default 'new',
  agent_note text check (char_length(agent_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index viewing_requests_business_idx on public.viewing_requests (business_id, created_at desc);
create index viewing_requests_buyer_idx on public.viewing_requests (buyer_id, created_at desc);
alter table public.viewing_requests enable row level security;

-- The business is always taken from the property, never trusted from the client.
-- Buyers can't change agent-side fields; agents can't rewrite the buyer's request.
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
    return new;
  end if;

  if auth.uid() is not null and new.buyer_id = auth.uid() and not public.is_member(old.business_id) then
    -- A buyer may only cancel their own request.
    if new.status <> 'closed' or new.agent_note is distinct from old.agent_note then
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

create trigger viewing_requests_guard
  before insert or update on public.viewing_requests
  for each row execute function public.viewing_requests_guard();

create policy viewing_buyer_select on public.viewing_requests for select using (buyer_id = auth.uid());
create policy viewing_buyer_insert on public.viewing_requests for insert with check (buyer_id = auth.uid());
create policy viewing_buyer_update on public.viewing_requests for update
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

create policy viewing_agent_select on public.viewing_requests for select
  using (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]));
create policy viewing_agent_update on public.viewing_requests for update
  using (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]))
  with check (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]));
