-- ProPilot AI · Property photos.
-- Files live in the public "property-media" bucket at
--   <business_id>/<property_id>/<random>.jpg  (+ a small "-thumb.jpg" copy)
-- Paths are random and unguessable; buyers discover photos only through the
-- listing functions below, which return photos of public, unsold listings only.

-- ---------------------------------------------------------------------------
-- Storage bucket (5 MB per file, images only)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Can the signed-in user manage files under this object path?
-- The first folder must be a business where they are owner or admin.
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

create policy "property media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'property-media' and public.can_manage_media(name));
create policy "property media read for managers" on storage.objects for select to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name));
create policy "property media update" on storage.objects for update to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name))
  with check (bucket_id = 'property-media' and public.can_manage_media(name));
create policy "property media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'property-media' and public.can_manage_media(name));

-- ---------------------------------------------------------------------------
-- Photo records
-- ---------------------------------------------------------------------------
alter table public.property_media add column thumb_path text;
alter table public.property_media add column width integer;
alter table public.property_media add column height integer;

-- Paths must sit under the property's own business and property folder, and a
-- property holds at most 20 photos.
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

create trigger property_media_guard
  before insert or update on public.property_media
  for each row execute function public.property_media_guard();

-- ---------------------------------------------------------------------------
-- Buyer-side photo lookups
-- ---------------------------------------------------------------------------
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

-- search_listings gains a cover photo; its return type changes, so recreate it.
drop function public.search_listings(text, public.property_type, bigint, int);

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
