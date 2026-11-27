-- Two changes the owner asked for on 27 Nov 2026.
--
-- 1. The licence number is optional. A broker, an agent or a developer who
--    lists without one still gets a public page: it says "No licence number
--    given", and the app files a report for the app admin to look at. Both
--    stop once the app admin marks that seller verified.
-- 2. A map on each listing. It shows the location typed on the listing; the
--    seller can add an exact pin (coordinates, or a place name from a Google
--    Maps link).

-- ---------------------------------------------------------------------------
-- 1. Licence number optional
-- ---------------------------------------------------------------------------
alter table public.properties drop constraint if exists properties_seller_license_check;
alter table public.properties add constraint properties_seller_license_check
  check (char_length(seller_license) <= 60);

-- One more reason a report can carry: the app's check for a missing licence number.
alter table public.listing_reports drop constraint if exists listing_reports_reason_check;
alter table public.listing_reports add constraint listing_reports_reason_check
  check (reason in ('not_real', 'pay_first', 'misleading', 'copied', 'other', 'auto_price', 'auto_photos', 'auto_wording', 'auto_license'));

-- Marking a seller verified also closes the "no licence number" reports on their listings.
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
    update public.listing_reports
    set status = 'dismissed', resolved_at = now(), resolved_by = p_by, resolution_note = 'Seller verified', reporter_contact = null
    where business_id = p_business and reason = 'auto_license' and status = 'open';
  else
    delete from public.seller_verifications where business_id = p_business;
  end if;
  -- No business on this line: the business's own audit log doesn't show the admin's note.
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_by, case when p_verified then 'admin.seller.verify' else 'admin.seller.unverify' end, 'business', p_business::text, jsonb_build_object('note', what));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The exact map pin, when the seller gives one
-- ---------------------------------------------------------------------------
-- "10.720200,122.562100", or a place name. Empty: the map uses the listing's location.
alter table public.properties add column if not exists map_query text;
alter table public.properties drop constraint if exists properties_map_query_check;
alter table public.properties add constraint properties_map_query_check
  check (char_length(map_query) between 1 and 200 and map_query !~ '[[:cntrl:]]');
