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
  (9, 'Listings from other sites', to_regclass('public.external_listings') is not null, 'Run 20261111020000_external_listings.sql'),
  (10, 'Facebook Pages', to_regclass('public.facebook_pages') is not null, 'Run 20261111030000_facebook_pages.sql'),
  (11, 'Messenger', to_regclass('public.messenger_conversations') is not null, 'Run 20261111040000_messenger.sql'),
  (12, 'Reports', to_regclass('public.listing_question_events') is not null, 'Run 20261111050000_reporting.sql'),
  (13, 'In-app chat', exists (select 1 from pg_proc where proname = 'my_app_conversations'), 'Run 20261112000000_app_chat.sql'),
  (14, 'Pipeline and AI agents', to_regclass('public.prospects') is not null, 'Run 20261112010000_pipeline.sql'),
  (15, 'Lead qualification', to_regclass('public.buyer_preferences') is not null, 'Run 20261112020000_qualification.sql'),
  (16, 'Plans and GCash payments', to_regclass('public.payments') is not null, 'Run 20261119000000_billing.sql'),
  (17, 'Buyer plans', to_regclass('public.buyer_subscriptions') is not null, 'Run 20261119010000_buyer_plans.sql'),
  (18, 'Owners and agents focus (public listing pages, Buyer Finder, Pro and Agency plans)', to_regclass('public.listing_matches') is not null and exists (select 1 from public.plans where code = 'agency' and is_active), 'Run 20261120000000_owner_focus.sql'),
  (19, 'Pricing Advisor, AI negotiation and chat language', to_regclass('public.listing_offers') is not null and to_regclass('public.price_checks') is not null, 'Run 20261120010000_pricing_and_negotiation.sql'),
  (20, 'Match alerts (buyer preferences with consent)', to_regclass('public.match_alerts') is not null and to_regclass('public.match_alert_sends') is not null, 'Run 20261120020000_match_alerts.sql'),
  (21, 'Profile photos', exists (select 1 from storage.buckets where id = 'avatars'), 'Run 20261120030000_profile_photos.sql'),
  (22, 'App owner can edit their own profile', exists (select 1 from pg_proc where proname = 'my_is_superadmin'), 'Run 20261123000000_superadmin_profile_edits.sql'),
  (23, 'AI closes deals at a pre-approved price', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'listing_floors' and column_name = 'accept_price_minor'), 'Run 20261124000000_ai_closing.sql'),
  (24, 'Only the app admin can delete listings', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'properties' and policyname = 'properties_delete' and qual like '%my_is_superadmin%'), 'Run 20261124010000_delete_listings_app_admin_only.sql')
) as t(n, item, ok, fix)
order by n;
