-- ProPilot AI: buyers + property photos, in one script.
-- Safe to run more than once, whether or not either part ran before.

do $$ begin
  create type public.account_type as enum ('agent', 'buyer');
exception when duplicate_object then null;
end $$;

alter table public.profiles add column if not exists account_type public.account_type not null default 'agent';

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

create or replace function public.my_account_type()
returns public.account_type
language sql stable security definer set search_path = public as $$
  select account_type from public.profiles where id = auth.uid()
$$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_superadmin = false
    and account_type = public.my_account_type()
  );

alter table public.properties add column if not exists is_public boolean not null default false;
create index if not exists properties_public_idx on public.properties (is_public, status) where is_public;

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

create table if not exists public.favorites (
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

drop policy if exists favorites_select on public.favorites;
create policy favorites_select on public.favorites for select using (user_id = auth.uid());
drop policy if exists favorites_insert on public.favorites;
create policy favorites_insert on public.favorites for insert
  with check (user_id = auth.uid() and public.is_public_listing(property_id));
drop policy if exists favorites_delete on public.favorites;
create policy favorites_delete on public.favorites for delete using (user_id = auth.uid());

do $$ begin
  create type public.viewing_status as enum ('new', 'contacted', 'scheduled', 'completed', 'closed');
exception when duplicate_object then null;
end $$;

create table if not exists public.viewing_requests (
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
create index if not exists viewing_requests_business_idx on public.viewing_requests (business_id, created_at desc);
create index if not exists viewing_requests_buyer_idx on public.viewing_requests (buyer_id, created_at desc);
alter table public.viewing_requests enable row level security;

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

drop trigger if exists viewing_requests_guard on public.viewing_requests;
create trigger viewing_requests_guard
  before insert or update on public.viewing_requests
  for each row execute function public.viewing_requests_guard();

drop policy if exists viewing_buyer_select on public.viewing_requests;
create policy viewing_buyer_select on public.viewing_requests for select using (buyer_id = auth.uid());
drop policy if exists viewing_buyer_insert on public.viewing_requests;
create policy viewing_buyer_insert on public.viewing_requests for insert with check (buyer_id = auth.uid());
drop policy if exists viewing_buyer_update on public.viewing_requests;
create policy viewing_buyer_update on public.viewing_requests for update
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

drop policy if exists viewing_agent_select on public.viewing_requests;
create policy viewing_agent_select on public.viewing_requests for select
  using (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]));
drop policy if exists viewing_agent_update on public.viewing_requests;
create policy viewing_agent_update on public.viewing_requests for update
  using (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]))
  with check (public.has_role(business_id, array['owner','admin','agent']::public.business_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_media(object_name text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  first_folder text := split_part(object_name, '/', 1);
  biz uuid;
begin
  begin
    biz := first_folder::uuid;
  exception when others then
    return false;
  end;
  return public.has_role(biz, array['owner', 'admin']::public.business_role[]);
end;
$$;

drop policy if exists "property media upload" on storage.objects;
create policy "property media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media' and public.can_manage_media(name));
drop policy if exists "property media read for managers" on storage.objects;
create policy "property media read for managers" on storage.objects for select to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name));
drop policy if exists "property media update" on storage.objects;
create policy "property media update" on storage.objects for update to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name))
  with check (bucket_id = 'property-media' and public.can_manage_media(name));
drop policy if exists "property media delete" on storage.objects;
create policy "property media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name));

alter table public.property_media add column if not exists thumb_path text;
alter table public.property_media add column if not exists width integer;
alter table public.property_media add column if not exists height integer;

create or replace function public.property_media_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prop_business uuid;
  prefix text;
begin
  select business_id into prop_business from public.properties where id = new.property_id;
  if prop_business is null then
    raise exception 'property not found';
  end if;
  new.business_id := prop_business;
  prefix := prop_business::text || '/' || new.property_id::text || '/';
  if left(new.storage_path, length(prefix)) <> prefix
     or (new.thumb_path is not null and left(new.thumb_path, length(prefix)) <> prefix) then
    raise exception 'photo path does not match the property';
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.property_media where property_id = new.property_id) >= 20 then
    raise exception 'a property can have at most 20 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists property_media_guard on public.property_media;
create trigger property_media_guard
  before insert or update on public.property_media
  for each row execute function public.property_media_guard();

create or replace function public.get_listing_media(p_id uuid)
returns table (id uuid, storage_path text, thumb_path text, width integer, height integer, sort_order integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.storage_path, m.thumb_path, m.width, m.height, m.sort_order
  from public.property_media m
  where m.property_id = p_id
    and m.kind = 'photo'
    and auth.uid() is not null
    and public.is_public_listing(p_id)
  order by m.sort_order, m.created_at
$$;

drop function if exists public.search_listings(text, public.property_type, bigint, int);

create function public.search_listings(
  p_query text default null,
  p_type public.property_type default null,
  p_max_price bigint default null,
  p_limit int default 48
)
returns table (
  id uuid, name text, type public.property_type, location text, price_minor bigint,
  reservation_fee_minor bigint, currency char(3), status public.property_status,
  description text, financing jsonb, business_name text, updated_at timestamptz,
  cover_path text, cover_thumb_path text, photo_count integer
)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.type, p.location, p.price_minor, p.reservation_fee_minor, p.currency, p.status,
         p.description, p.financing, b.name, p.updated_at,
         cover.storage_path, cover.thumb_path,
         (select count(*)::int from public.property_media pm where pm.property_id = p.id and pm.kind = 'photo')
  from public.properties p
  join public.businesses b on b.id = p.business_id
  left join lateral (
    select m.storage_path, m.thumb_path from public.property_media m
    where m.property_id = p.id and m.kind = 'photo'
    order by m.sort_order, m.created_at
    limit 1
  ) cover on true
  where auth.uid() is not null
    and p.is_public
    and p.status in ('available', 'reserved')
    and (p_query is null or p_query = '' or p.name ilike '%' || p_query || '%' or p.location ilike '%' || p_query || '%')
    and (p_type is null or p.type = p_type)
    and (p_max_price is null or p.price_minor <= p_max_price)
  order by (p.status = 'available') desc, p.updated_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

grant execute on function public.search_listings(text, public.property_type, bigint, int) to authenticated;
grant execute on function public.get_listing_media(uuid) to authenticated;
