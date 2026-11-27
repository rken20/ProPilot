import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { filterBrowse, pageOf, sortBrowse, type BrowseQuery, type BrowseRow } from "@/lib/browse-rules";
import type { Listing } from "@/lib/listings";
import { planRank } from "@/lib/match-alert-rules";
import { isCapacity, type SellerInfo } from "@/lib/seller-trust";

/**
 * A listing as anyone with its link sees it. Read with the service role because
 * visitors have no account; only listings the owner made public, and only
 * buyer-safe fields, ever leave here.
 */
export type PublicListing = {
  id: string;
  name: string;
  type: string;
  location: string;
  price_minor: number;
  reservation_fee_minor: number | null;
  currency: string;
  status: "available" | "reserved";
  description: string | null;
  financing: Listing["financing"];
  business_name: string;
  /** The seller, for the page's language. */
  business_id: string;
  /** What the seller declared, and whether MyHomeSeller has verified them. */
  seller: SellerInfo;
  photos: Array<{ id: string; path: string; thumb: string }>;
  created_at: string | null;
  updated_at: string | null;
};

/** The verified mark, read off a business row with its `seller_verifications` joined (one row, or none). */
function verifiedIn(business: unknown): boolean {
  const v = (business as { seller_verifications?: unknown } | null)?.seller_verifications;
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

export const getPublicListing = cache(async (id: string): Promise<PublicListing | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: p } = await admin
    .from("properties")
    .select("id, business_id, name, type, location, price_minor, reservation_fee_minor, currency, status, description, financing, seller_capacity, seller_license, created_at, updated_at, businesses!inner(name, restricted_at, seller_verifications(verified_at))")
    .eq("id", id)
    .eq("is_public", true)
    // A business the app admin has restricted has no public pages until it is lifted.
    .is("businesses.restricted_at", null)
    .in("status", ["available", "reserved"])
    .maybeSingle();
  if (!p) return null;
  const { data: media } = await admin
    .from("property_media")
    .select("id, storage_path, thumb_path")
    .eq("property_id", id)
    .eq("kind", "photo")
    .order("sort_order")
    .order("created_at")
    .limit(20);
  return {
    id: p.id as string,
    name: p.name as string,
    type: p.type as string,
    location: p.location as string,
    price_minor: Number(p.price_minor),
    reservation_fee_minor: p.reservation_fee_minor === null ? null : Number(p.reservation_fee_minor),
    currency: (p.currency as string) ?? "PHP",
    status: p.status as "available" | "reserved",
    description: (p.description as string | null) ?? null,
    financing: (p.financing as Listing["financing"]) ?? null,
    business_name: (p.businesses as unknown as { name: string } | null)?.name ?? "the agent",
    business_id: p.business_id as string,
    seller: { capacity: isCapacity(p.seller_capacity) ? p.seller_capacity : null, license: (p.seller_license as string | null) ?? null, verified: verifiedIn(p.businesses) },
    created_at: (p.created_at as string | null) ?? null,
    updated_at: (p.updated_at as string | null) ?? null,
    photos: (media ?? []).map((m) => ({ id: m.id as string, path: m.storage_path as string, thumb: (m.thumb_path ?? m.storage_path) as string })),
  };
});

/** Every listing with a public page, for the sitemap. Ids and dates only. */
export async function publicListingIds(limit = 5000): Promise<Array<{ id: string; updated_at: string | null }>> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data } = await admin
      .from("properties")
      .select("id, updated_at, businesses!inner(restricted_at)")
      .eq("is_public", true)
      .is("businesses.restricted_at", null)
      .in("status", ["available", "reserved"])
      .order("updated_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((p) => ({ id: p.id as string, updated_at: (p.updated_at as string | null) ?? null }));
  } catch {
    // The sitemap is also built during a deploy; a database hiccup then mustn't fail the deploy.
    return [];
  }
}

/** A listing as a card on the public Properties page. */
export type BrowseListing = BrowseRow & {
  currency: string;
  financing: Listing["financing"];
  /** The seller is on a paid plan, which is why it shows first by default. */
  featured: boolean;
  /** MyHomeSeller has verified the seller. */
  verified: boolean;
  thumb: string | null;
};

/**
 * The public Properties page: every listing with a public page, filtered,
 * ordered and cut to one page. The default order puts paid sellers first.
 *
 * Ordering by plan needs each seller's current plan, so this reads the newest
 * `cap` listings and orders them here. Past that many public listings, the
 * oldest fall off the page; move the ordering into the database before then.
 */
export async function browsePublicListings(query: BrowseQuery, cap = 1000): Promise<{ items: BrowseListing[]; page: number; pages: number; total: number; all: number }> {
  const none = { items: [], page: 1, pages: 1, total: 0, all: 0 };
  const admin = createAdminClient();
  if (!admin) return none;
  const { data } = await admin
    .from("properties")
    .select("id, business_id, name, type, location, price_minor, currency, status, financing, created_at, businesses!inner(restricted_at, seller_verifications(verified_at))")
    .eq("is_public", true)
    .is("businesses.restricted_at", null)
    .in("status", ["available", "reserved"])
    .order("created_at", { ascending: false })
    .limit(cap);
  if (!data?.length) return none;
  const rows = data.map((p) => ({
    id: p.id as string,
    business_id: p.business_id as string,
    name: p.name as string,
    type: p.type as string,
    location: p.location as string,
    price_minor: Number(p.price_minor),
    currency: (p.currency as string) ?? "PHP",
    status: p.status as "available" | "reserved",
    financing: (p.financing as Listing["financing"]) ?? null,
    created_at: (p.created_at as string | null) ?? null,
    verified: verifiedIn(p.businesses),
  }));

  // Only plans whose paid period is still running count; everyone else is on Free.
  const sellers = [...new Set(rows.map((r) => r.business_id))];
  const { data: subs } = await admin.from("subscriptions").select("business_id, plans(code)").in("business_id", sellers).gt("current_period_end", new Date().toISOString());
  const plan = new Map((subs ?? []).map((s) => [s.business_id as string, (s.plans as unknown as { code: string } | null)?.code]));
  const planOf = (b: string) => plan.get(b);

  const found = pageOf(sortBrowse(filterBrowse(rows, query), query.sort, planOf), query.page);
  const ids = found.items.map((r) => r.id);
  const { data: media } = ids.length
    ? await admin.from("property_media").select("property_id, storage_path, thumb_path").in("property_id", ids).eq("kind", "photo").order("sort_order").order("created_at")
    : { data: [] };
  const cover = new Map<string, string>();
  for (const m of media ?? []) if (!cover.has(m.property_id as string)) cover.set(m.property_id as string, (m.thumb_path ?? m.storage_path) as string);
  return {
    ...found,
    all: rows.length,
    items: found.items.map((r) => ({ ...r, featured: planRank(planOf(r.business_id)) > 0, thumb: cover.get(r.id) ?? null })),
  };
}

/** The shareable address of a listing's public page. */
export const publicListingPath = (id: string) => `/l/${id}`;

/** Count a view of a public page (best-effort, after the page is sent). Not a server action, so it can't be called from outside. */
export async function recordListingView(propertyId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("record_listing_view", { p_property: propertyId });
}
