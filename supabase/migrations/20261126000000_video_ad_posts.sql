-- Posting a video ad to a Facebook Page.
--
-- A video ad is made on the owner's device and never leaves it, unless they
-- choose to post it. Then the browser uploads the file here through a one-time
-- signed link the server gives it, Facebook fetches it through a short-lived
-- link, and the daily job deletes it a day later.
--
-- The bucket has no storage policies on purpose: nobody reads, lists or writes
-- it with their own session. Only the server (service role) hands out links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('video-ads', 'video-ads', false, 62914560, array['video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The post log already takes kind 'video'. It now says which video ad a post
-- came from and the video's id on Facebook, so its results can be read later.
alter table public.facebook_posts
  add column if not exists video_ad_id uuid references public.video_ads (id) on delete set null,
  add column if not exists fb_video_id text check (fb_video_id is null or fb_video_id ~ '^[0-9]{5,30}$');
create index if not exists facebook_posts_video_ad on public.facebook_posts (video_ad_id) where video_ad_id is not null;
