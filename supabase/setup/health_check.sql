-- ProPilot AI: shows which setup scripts have run. Read-only; safe to run any time.
select item, case when ok then 'OK' else 'MISSING' end as status, fix
from (values
  (1, 'Team invites',            exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'email'), 'Run 20261110010000_invitations_and_profiles.sql'),
  (2, 'Buyer accounts',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_type'), 'Run setup/buyers_and_photos.sql'),
  (3, 'Photo storage',           exists (select 1 from storage.buckets where id = 'property-media'), 'Run setup/buyers_and_photos.sql'),
  (4, 'Google sign-in choice',   exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'account_type_chosen'), 'Run 20261110040000_account_type_choice.sql'),
  (5, 'Viewing times + Google',  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'viewing_requests' and column_name = 'scheduled_at'), 'Run 20261111000000_google_and_notifications.sql, then rate limits again'),
  (6, 'Google connections',      to_regclass('public.google_connections') is not null, 'Run 20261111000000_google_and_notifications.sql, then rate limits again'),
  (7, 'Rate limits',             exists (select 1 from pg_proc where proname = 'consume_rate_limit'), 'Run 20261111010000_rate_limits.sql'),
  (8, 'Request limits active',   exists (select 1 from pg_proc where proname = 'viewing_requests_guard' and prosrc like '%too many viewing requests%'), 'Run 20261111010000_rate_limits.sql'),
  (9, 'Listings from other sites', to_regclass('public.external_listings') is not null, 'Run 20261111020000_external_listings.sql')
) as t(n, item, ok, fix)
order by n;
