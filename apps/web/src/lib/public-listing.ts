import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Listing } from "@/lib/listings";

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
  photos: Array<{ id: string; path: string; thumb: string }>;
  created_at: string | null;
  updated_at: string | null;
};

export const getPublicListing = cache(async (id: string): Promise<PublicListing | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: p } = await admin
    .from("properties")
    .select("id, business_id, name, type, location, price_minor, reservation_fee_minor, currency, status, description, financing, created_at, updated_at, businesses!inner(name, restricted_at)")
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

/** The shareable address of a listing's public page. */
export const publicListingPath = (id: string) => `/l/${id}`;

/** Count a view of a public page (best-effort, after the page is sent). Not a server action, so it can't be called from outside. */
export async function recordListingView(propertyId: string) {
  const admin = createAdminClient();
  if (!admin) return;
  await admin.rpc("record_listing_view", { p_property: propertyId });
}
