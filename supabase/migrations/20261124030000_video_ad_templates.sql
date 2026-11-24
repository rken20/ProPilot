-- Two more Video Ad Maker templates: Price Reveal ('reveal') and Top 3 Reasons
-- ('reasons'). video_ads records which template each video used, and its check
-- has to know the new names before the app offers them.

alter table public.video_ads drop constraint if exists video_ads_template_check;
alter table public.video_ads
  add constraint video_ads_template_check check (template in ('showcase', 'bold', 'elegant', 'facts', 'reveal', 'reasons'));
