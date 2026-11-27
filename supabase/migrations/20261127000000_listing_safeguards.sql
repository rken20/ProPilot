-- Safeguards against fake listings and scams (owner's decisions, 27 Nov 2026).
--
-- 1. Seller declaration: whoever lists a property says in what capacity (the
--    owner, a licensed broker, an agent, a developer), gives the licence number
--    that goes with it, and confirms the listing is real. The database stamps
--    who declared and when, and a listing can't get a public page without one.
-- 2. Reports: anyone can report a public listing, and the app files its own
--    reports when a listing looks wrong (price, photos, wording). Only the app
--    admin reads them.
-- 3. Taking a listing down: the app admin can take a listing off public pages.
--    The seller can't put it back.
-- 4. Verified sellers: the app admin marks a business verified after checking
--    proof outside the app. Only the decision and a note are kept here, never
--    an ID or a land title.
--
-- New sellers' listings are public at once; their pages say "Not yet verified".

-- ---------------------------------------------------------------------------
-- 1 and 3. On the listing
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists seller_capacity text;
alter table public.properties add column if not exists seller_license text;
alter table public.properties add column if not exists declared_at timestamptz;
alter table public.properties add column if not exists declared_by uuid references auth.users (id) on delete set null;
alter table public.properties add column if not exists taken_down_at timestamptz;
alter table public.properties add column if not exists taken_down_reason text;

alter table public.properties drop constraint if exists properties_seller_capacity_check;
alter table public.properties add constraint properties_seller_capacity_check
  check (seller_capacity is null or seller_capacity in ('owner', 'broker', 'agent', 'developer'));
alter table public.properties drop constraint if exists properties_seller_license_check;
alter table public.properties add constraint properties_seller_license_check
  check (
    char_length(seller_license) <= 60
    -- A broker, an agent and a developer each list under a licence number.
    and (seller_capacity is null or seller_capacity = 'owner' or nullif(btrim(seller_license), '') is not null)
  );
alter table public.properties drop constraint if exists properties_taken_down_check;
alter table public.properties add constraint properties_taken_down_check
  check (char_length(taken_down_reason) <= 500 and (taken_down_at is null or not is_public));

-- What a signed-in person can and can't do to these columns. The server (no
-- signed-in user) is the only one that takes a listing down or puts it back.
create or replace function public.properties_guard_trust()
returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.taken_down_at := null;
    new.taken_down_reason := null;
    new.declared_at := case when new.seller_capacity is null then null else now() end;
    new.declared_by := case when new.seller_capacity is null then null else auth.uid() end;
    if new.is_public and new.seller_capacity is null then
      raise exception 'a public listing needs a seller declaration';
    end if;
    return new;
  end if;

  if new.taken_down_at is distinct from old.taken_down_at or new.taken_down_reason is distinct from old.taken_down_reason then
    raise exception 'only MyHomeSeller can change this';
  end if;
  -- Taken down stays down, whatever the form sends.
  if old.taken_down_at is not null then
    new.is_public := false;
  end if;

  if new.seller_capacity is null then
    if old.seller_capacity is not null then
      raise exception 'a seller declaration cannot be removed';
    end if;
    new.declared_at := null;
    new.declared_by := null;
  elsif old.seller_capacity is null
     or new.seller_capacity <> old.seller_capacity
     or new.seller_license is distinct from old.seller_license then
    -- Made, or changed: it is this person's declaration now.
    new.declared_at := now();
    new.declared_by := auth.uid();
  else
    new.declared_at := old.declared_at;
    new.declared_by := old.declared_by;
  end if;

  -- Listings from before this rule stay public; giving one a public page from now on needs a declaration.
  if new.is_public and not old.is_public and new.seller_capacity is null then
    raise exception 'a public listing needs a seller declaration';
  end if;
  return new;
end;
$$;
drop trigger if exists properties_guard_trust on public.properties;
create trigger properties_guard_trust
  before insert or update on public.properties
  for each row execute function public.properties_guard_trust();

-- ---------------------------------------------------------------------------
-- 4. Verified sellers
-- ---------------------------------------------------------------------------
-- A row means verified. The note is for the app admin only: what was checked
-- and how. The proof itself never comes into the app.
create table if not exists public.seller_verifications (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  verified_at timestamptz not null default now(),
  verified_by uuid references auth.users (id) on delete set null,
  note text check (char_length(note) <= 500)
);
alter table public.seller_verifications enable row level security;
drop policy if exists seller_verifications_select on public.seller_verifications;
create policy seller_verifications_select on public.seller_verifications for select to authenticated
  using (public.my_is_superadmin());

-- ---------------------------------------------------------------------------
-- 2. Reports
-- ---------------------------------------------------------------------------
create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- A visitor on the public page, or one of the app's own checks.
  source text not null check (source in ('visitor', 'auto')),
  reason text not null check (reason in ('not_real', 'pay_first', 'misleading', 'copied', 'other', 'auto_price', 'auto_photos', 'auto_wording')),
  details text check (char_length(details) <= 1000),
  -- Optional, from the visitor, so the admin can ask about the report. Erased when the report is closed.
  reporter_contact text check (char_length(reporter_contact) <= 120),
  status text not null default 'open' check (status in ('open', 'dismissed', 'taken_down')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 500),
  created_at timestamptz not null default now(),
  check ((source = 'auto') = (reason like 'auto\_%')),
  check (status = 'open' or reporter_contact is null)
);
create index if not exists listing_reports_open on public.listing_reports (created_at desc) where status = 'open';
create index if not exists listing_reports_property on public.listing_reports (property_id);
alter table public.listing_reports enable row level security;
-- The seller never sees who reported them, or that they were reported.
drop policy if exists listing_reports_select on public.listing_reports;
create policy listing_reports_select on public.listing_reports for select to authenticated
  using (public.my_is_superadmin());

-- File a report (server only). Returns the new report's id, or null when
-- nothing new was filed: the app's own check already has the same report open
-- (or the admin already dismissed that exact finding), or the listing already
-- has many visitor reports waiting.
create or replace function public.report_listing(p_property uuid, p_source text, p_reason text, p_details text default null, p_contact text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  biz uuid;
  rid uuid;
  what text := nullif(btrim(left(coalesce(p_details, ''), 1000)), '');
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function report_listing';
  end if;
  select business_id into biz from public.properties
  where id = p_property and (p_source = 'auto' or (is_public and status in ('available', 'reserved')));
  if biz is null then
    raise exception 'listing not available';
  end if;

  if p_source = 'auto' then
    if exists (
      select 1 from public.listing_reports r
      where r.property_id = p_property and r.reason = p_reason
        and (r.status = 'open' or (r.status = 'dismissed' and r.details is not distinct from what))
    ) then
      return null;
    end if;
  elsif (select count(*) from public.listing_reports r where r.property_id = p_property and r.source = 'visitor' and r.status = 'open') >= 20 then
    return null;
  end if;

  insert into public.listing_reports (property_id, business_id, source, reason, details, reporter_contact)
  values (p_property, biz, p_source, p_reason, what, case when p_source = 'visitor' then nullif(btrim(left(coalesce(p_contact, ''), 120)), '') end)
  returning id into rid;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the app admin does about them (server only, super admin, audit logged)
-- ---------------------------------------------------------------------------
-- Take a listing off public pages. The reason is shown to the seller. Every
-- report still open on it is closed with it.
create or replace function public.admin_take_down_listing(p_property uuid, p_reason text, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  why text := nullif(btrim(left(coalesce(p_reason, ''), 500)), '');
begin
  perform public.admin_check(p_by, 'admin_take_down_listing');
  if why is null then
    raise exception 'say why the listing is taken down';
  end if;
  update public.properties
  set is_public = false, taken_down_at = coalesce(taken_down_at, now()), taken_down_reason = why, updated_at = now()
  where id = p_property;
  if not found then
    raise exception 'listing not found';
  end if;
  update public.listing_reports
  set status = 'taken_down', resolved_at = now(), resolved_by = p_by, resolution_note = why, reporter_contact = null
  where property_id = p_property and status = 'open';
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_by, 'admin.listing.take_down', 'property', p_property::text, jsonb_build_object('reason', why));
end;
$$;

-- Put a listing that was taken down back on public pages.
create or replace function public.admin_restore_listing(p_property uuid, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_by, 'admin_restore_listing');
  update public.properties
  set taken_down_at = null, taken_down_reason = null, is_public = true, updated_at = now()
  where id = p_property and taken_down_at is not null;
  if not found then
    raise exception 'listing not found';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (p_by, 'admin.listing.restore', 'property', p_property::text);
end;
$$;

-- Close one report without taking the listing down.
create or replace function public.admin_dismiss_report(p_report uuid, p_note text, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_check(p_by, 'admin_dismiss_report');
  update public.listing_reports
  set status = 'dismissed', resolved_at = now(), resolved_by = p_by,
      resolution_note = nullif(btrim(left(coalesce(p_note, ''), 500)), ''), reporter_contact = null
  where id = p_report and status = 'open';
  if not found then
    raise exception 'report not found';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (p_by, 'admin.report.dismiss', 'listing_report', p_report::text);
end;
$$;

-- Mark a business verified, or take the mark away.
create or replace function public.admin_set_verified(p_business uuid, p_verified boolean, p_note text, p_by uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  what text := nullif(btrim(left(coalesce(p_note, ''), 500)), '');
begin
  perform public.admin_check(p_by, 'admin_set_verified');
  perform 1 from public.businesses where id = p_business;
  if not found then
    raise exception 'business not found';
  end if;
  if p_verified then
    if what is null then
      raise exception 'note what you checked';
    end if;
    insert into public.seller_verifications (business_id, verified_by, note) values (p_business, p_by, what)
    on conflict (business_id) do update set verified_at = now(), verified_by = excluded.verified_by, note = excluded.note;
  else
    delete from public.seller_verifications where business_id = p_business;
  end if;
  -- No business on this line: the business's own audit log doesn't show the admin's note.
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_by, case when p_verified then 'admin.seller.verify' else 'admin.seller.unverify' end, 'business', p_business::text, jsonb_build_object('note', what));
end;
$$;

-- The Accounts list, now saying which businesses are verified (and the admin's note).
create or replace function public.admin_accounts(p_by uuid, p_search text default null, p_limit int default 200)
returns table (
  user_id uuid,
  email text,
  full_name text,
  status text,
  is_superadmin boolean,
  signed_up timestamptz,
  last_sign_in timestamptz,
  businesses jsonb
)
language plpgsql security definer set search_path = public as $$
declare
  needle text := lower(btrim(coalesce(p_search, '')));
begin
  perform public.admin_check(p_by, 'admin_accounts');
  return query
  select
    pr.id,
    u.email::text,
    pr.full_name,
    pr.status::text,
    pr.is_superadmin,
    pr.created_at,
    u.last_sign_in_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'role', m.role,
        'member_status', m.status,
        'restricted', b.restricted_at is not null,
        'verified_at', sv.verified_at,
        'verified_note', sv.note,
        'plan_code', coalesce(pl.code, 'free'),
        'plan_name', coalesce(pl.name, 'Free'),
        'period_end', s.current_period_end,
        'listings', (select count(*) from public.properties x where x.business_id = b.id),
        -- Deleting this person deletes the business too when nobody else owns it.
        'sole_owner', m.role = 'owner' and not exists (
          select 1 from public.business_members o
          where o.business_id = b.id and o.user_id <> pr.id and o.role = 'owner' and o.status = 'active')
      ) order by b.created_at)
      from public.business_members m
      join public.businesses b on b.id = m.business_id
      left join public.subscriptions s on s.business_id = b.id and s.current_period_end > now()
      left join public.plans pl on pl.id = s.plan_id
      left join public.seller_verifications sv on sv.business_id = b.id
      where m.user_id = pr.id
    ), '[]'::jsonb)
  from public.profiles pr
  join auth.users u on u.id = pr.id
  where needle = ''
    or position(needle in lower(coalesce(u.email, ''))) > 0
    or position(needle in lower(pr.full_name)) > 0
    or exists (
      select 1 from public.business_members m join public.businesses b on b.id = m.business_id
      where m.user_id = pr.id and position(needle in lower(b.name)) > 0)
  order by pr.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- ---------------------------------------------------------------------------
-- A fingerprint of each photo, to notice the same photos under another seller
-- ---------------------------------------------------------------------------
-- 16 hex characters worked out on the server from the picture itself (not the
-- file), so a resized or re-saved copy still matches.
alter table public.property_media add column if not exists photo_hash text check (photo_hash ~ '^[0-9a-f]{16}$');
create index if not exists property_media_photo_hash on public.property_media (photo_hash) where photo_hash is not null;

-- ---------------------------------------------------------------------------
-- Server only
-- ---------------------------------------------------------------------------
revoke execute on function public.report_listing(uuid, text, text, text, text) from public, authenticated;
revoke execute on function public.admin_take_down_listing(uuid, text, uuid) from public, authenticated;
revoke execute on function public.admin_restore_listing(uuid, uuid) from public, authenticated;
revoke execute on function public.admin_dismiss_report(uuid, text, uuid) from public, authenticated;
revoke execute on function public.admin_set_verified(uuid, boolean, text, uuid) from public, authenticated;
revoke execute on function public.admin_accounts(uuid, text, int) from public, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.report_listing(uuid, text, text, text, text) from anon;
    revoke execute on function public.admin_take_down_listing(uuid, text, uuid) from anon;
    revoke execute on function public.admin_restore_listing(uuid, uuid) from anon;
    revoke execute on function public.admin_dismiss_report(uuid, text, uuid) from anon;
    revoke execute on function public.admin_set_verified(uuid, boolean, text, uuid) from anon;
    revoke execute on function public.admin_accounts(uuid, text, int) from anon;
    revoke all on public.seller_verifications from anon;
    revoke all on public.listing_reports from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.report_listing(uuid, text, text, text, text) to service_role;
    grant execute on function public.admin_take_down_listing(uuid, text, uuid) to service_role;
    grant execute on function public.admin_restore_listing(uuid, uuid) to service_role;
    grant execute on function public.admin_dismiss_report(uuid, text, uuid) to service_role;
    grant execute on function public.admin_set_verified(uuid, boolean, text, uuid) to service_role;
    grant execute on function public.admin_accounts(uuid, text, int) to service_role;
  end if;
end;
$$;
