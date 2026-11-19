-- Home Finder AI · Pro plan (₱999 a month), for businesses and for buyers.
--
-- Pro is everything in Basic, plus:
-- - businesses: Buyer Finder sends to up to 20 matching buyers a month (Basic: 5);
--   AI video creation is on the card as "coming soon" and stays at 0 until built.
-- - buyers: 45 AI searches of other property sites a day (Basic: 15), and they're
--   listed first to agents with a matching listing.
-- Paying, confirming and renewing work as for Basic. Switching plans starts a
-- new period from the day the payment is confirmed.

insert into public.plans (code, name, price_minor, trial_days, sort_order, is_active) values
  ('pro', 'Pro', 99900, 0, 2, true)
on conflict (code) do update set name = excluded.name, price_minor = excluded.price_minor, sort_order = excluded.sort_order, is_active = true;

-- Limits. No row = not included; a null limit = unlimited; 0 = not included.
insert into public.plan_entitlements (plan_id, feature_key, "limit")
select p.id, e.feature_key, e.lim
from public.plans p
join (values
  ('pro', 'ai', null::int),
  ('pro', 'home_finder_buyers', 20),
  ('pro', 'ai_video_generations', 0),
  ('pro', 'online_searches_day', 45),
  ('basic', 'online_searches_day', 15),
  ('free', 'online_searches_day', 0)
) as e(code, feature_key, lim) on e.code = p.code
on conflict (plan_id, feature_key) do update set "limit" = excluded."limit";
