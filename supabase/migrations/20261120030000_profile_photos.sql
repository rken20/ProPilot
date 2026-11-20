-- MyHomeSeller · Profile photos.
-- Each person can add one photo, shown to them and their teammates.
-- Files live in the public "avatars" bucket at <user id>/<random>.jpg. The
-- random name can't be guessed, and only the person can add, change or delete
-- files in their own folder.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar upload" on storage.objects;
create policy "avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "avatar read own" on storage.objects;
create policy "avatar read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "avatar update" on storage.objects;
create policy "avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists "avatar delete" on storage.objects;
create policy "avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- A profile can only point at a photo in its own folder.
alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles add constraint profiles_avatar_path_own
  check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));
