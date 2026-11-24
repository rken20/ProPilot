-- MyHomeSeller · Video Ad Maker (Pro and Agency).
--
-- A video ad is made in the owner's own browser from the listing's photos, so
-- no video is stored here. This table only records that one was made: it is
-- what the month's allowance counts, and it keeps the template and words used.
-- Pro makes 10 a month, Agency 30.

create table if not exists public.video_ads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  property_id uuid references public.properties (id) on delete set null,
  template text not null check (template in ('showcase', 'bold', 'elegant', 'facts')),
  shape text not null check (shape in ('vertical', 'square', 'wide')),
  ad_text jsonb not null check (pg_column_size(ad_text) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists video_ads_business on public.video_ads (business_id, created_at desc);
alter table public.video_ads enable row level security;

-- The team can see what was made. Nobody writes here directly: rows come only
-- from video_ad_start, which the server calls after checking the plan.
drop policy if exists video_ads_select on public.video_ads;
create policy video_ads_select on public.video_ads for select to authenticated
  using (public.is_member(business_id));

-- Server only. Takes one video ad from the month's allowance (Manila month) and
-- returns its id, or null when the user isn't on the team, the listing isn't
-- the business's, or the allowance is used up.
-- p_limit is the plan's monthly limit (null = unlimited, 0 = not included).
create or replace function public.video_ad_start(p_business uuid, p_user uuid, p_limit int, p_property uuid, p_template text, p_shape text, p_text jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  used int;
  vid uuid;
begin
  if auth.uid() is not null then
    raise exception 'permission denied for function video_ad_start';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id = p_business and user_id = p_user and status = 'active'
  ) then
    return null;
  end if;
  if not exists (select 1 from public.properties where id = p_property and business_id = p_business) then
    return null;
  end if;
  -- One at a time per business, so the count below can't be raced past.
  perform pg_advisory_xact_lock(hashtext('video_ad:' || p_business::text));
  if p_limit is not null then
    select count(*) into used from public.video_ads
      where business_id = p_business
        and created_at >= (date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
    if used >= p_limit then
      return null;
    end if;
  end if;
  insert into public.video_ads (business_id, created_by, property_id, template, shape, ad_text)
  values (p_business, p_user, p_property, p_template, p_shape, p_text)
  returning id into vid;
  return vid;
end;
$$;

revoke all on function public.video_ad_start(uuid, uuid, int, uuid, text, text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.video_ad_start(uuid, uuid, int, uuid, text, text, jsonb) from anon, authenticated';
    execute 'revoke insert, update, delete on public.video_ads from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.video_ad_start(uuid, uuid, int, uuid, text, text, jsonb) to service_role';
  end if;
end $$;

-- The monthly allowance: 10 on Pro, 30 on Agency (it was 0 while the feature was "coming soon").
insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('pro', 'ai_video_generations', 10),
  ('agency', 'ai_video_generations', 30)
) as e(code, feature_key, lim) on e.code = p.code
on conflict (plan_id, feature_key) do update set "limit" = excluded."limit";
