-- MyHomeSeller · Only the app's own admin can delete a listing for good.
-- Owners, admins and agents change a listing's status instead (Sold, Reserved,
-- Archived): nothing is lost, and its inquiries and history stay. Deleting
-- removes the listing with its photos, inquiries, views and offers, so it is
-- kept for the app admin (a super admin), and only in a business they run.
-- Until now any business owner or admin could delete through the database.

drop policy if exists properties_delete on public.properties;
create policy properties_delete on public.properties for delete
  using (
    public.my_is_superadmin()
    and public.has_role(business_id, array['owner','admin']::public.business_role[])
  );
