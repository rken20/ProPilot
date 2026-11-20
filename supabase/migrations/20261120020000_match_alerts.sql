-- MyHomeSeller · Match alerts: buyers who agree get emails about listings that fit.
--
-- A buyer sending an inquiry can say what they're looking for and tick a box to
-- get emails about matching listings. Nothing is used until they confirm from
-- the email we send (so nobody can sign up someone else's address).
--
-- Both tables are for the server only: row-level security is on with no
-- policies, so no signed-in or anonymous client can read or write them. Sellers
-- never see these rows; a seller sees a buyer only when the buyer inquires.

create table if not exists public.match_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 5 and 254 and email = lower(email)),
  name text check (char_length(name) <= 120),
  budget_max_minor bigint check (budget_max_minor > 0),
  areas text[] not null default '{}' check (cardinality(areas) <= 5 and char_length(array_to_string(areas, '|')) <= 300),
  property_types text[] not null default '{}'
    check (property_types <@ array['condominium', 'house_and_lot', 'townhouse', 'lot', 'commercial', 'other']),
  financing text check (financing in ('cash', 'bank', 'pagibig', 'in_house', 'unsure')),
  -- Where the buyer signed up, so that seller's listings aren't sent back as "new".
  source_business_id uuid references public.businesses (id) on delete set null,
  source_property_id uuid references public.properties (id) on delete set null,
  -- Proof of consent: the exact words the buyer agreed to, and when.
  consent_text text not null check (char_length(consent_text) between 20 and 600),
  consent_at timestamptz not null default now(),
  -- Set when the buyer confirms from the email. Unconfirmed alerts are never matched.
  confirmed_at timestamptz,
  last_emailed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Preferences aren't kept forever: a year, unless the buyer stops sooner.
  expires_at timestamptz not null default (now() + interval '12 months')
);
create index if not exists match_alerts_email on public.match_alerts (email);
create index if not exists match_alerts_due on public.match_alerts (last_emailed_at nulls first) where confirmed_at is not null;
alter table public.match_alerts enable row level security;

-- Which listings an alert has already been emailed, so none is sent twice.
create table if not exists public.match_alert_sends (
  alert_id uuid not null references public.match_alerts (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (alert_id, property_id)
);
alter table public.match_alert_sends enable row level security;

-- No policies on purpose, and no table rights for clients either.
revoke all on public.match_alerts from public;
revoke all on public.match_alert_sends from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.match_alerts from anon';
    execute 'revoke all on public.match_alert_sends from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.match_alerts from authenticated';
    execute 'revoke all on public.match_alert_sends from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.match_alerts to service_role';
    execute 'grant select, insert, update, delete on public.match_alert_sends to service_role';
  end if;
end;
$$;
