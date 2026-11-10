import "server-only";
import type { PROPERTY_TYPES } from "@propilot/shared";
import { createClient } from "@/lib/supabase/server";

/** A listing as buyers see it: public, unsold, and only buyer-safe fields. */
export type Listing = {
  id: string;
  name: string;
  type: (typeof PROPERTY_TYPES)[number];
  location: string;
  price_minor: number;
  reservation_fee_minor: number | null;
  currency: string;
  status: "available" | "reserved";
  description: string | null;
  financing: {
    bankFinancing?: boolean;
    pagIbig?: boolean;
    inHouse?: boolean;
    downpaymentPercent?: number;
    notes?: string;
  } | null;
  business_name: string;
  updated_at: string;
  /** Present on search results only. */
  cover_path?: string | null;
  cover_thumb_path?: string | null;
  photo_count?: number;
};

export type ListingPhoto = { id: string; storage_path: string; thumb_path: string | null; width: number | null; height: number | null };

function normalize(rows: unknown[] | null): Listing[] {
  return (rows ?? []).map((r) => {
    const l = r as Listing;
    return {
      ...l,
      price_minor: Number(l.price_minor),
      reservation_fee_minor: l.reservation_fee_minor === null ? null : Number(l.reservation_fee_minor),
      photo_count: l.photo_count === undefined ? undefined : Number(l.photo_count),
    };
  });
}

export async function searchListings(filters: { q?: string; type?: string; maxPriceMinor?: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_listings", {
    p_query: filters.q || null,
    p_type: filters.type || null,
    p_max_price: filters.maxPriceMinor ?? null,
    p_limit: 60,
  });
  return { listings: normalize(data as unknown[] | null), error };
}

export async function getListing(id: string): Promise<Listing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_listing", { p_id: id });
  return normalize(data as unknown[] | null)[0] ?? null;
}

/** Photos of a public listing, cover first. Empty for private or sold listings. */
export async function getListingPhotos(id: string): Promise<ListingPhoto[]> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_listing_media", { p_id: id });
  return (data ?? []) as ListingPhoto[];
}

/** Cover thumbnail per property, for an agent's own listings (read under their business's RLS). */
export async function getCoverThumbs(propertyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!propertyIds.length) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("property_id, storage_path, thumb_path, sort_order, created_at")
    .in("property_id", propertyIds)
    .eq("kind", "photo")
    .order("sort_order")
    .order("created_at");
  for (const m of data ?? []) {
    if (!out.has(m.property_id)) out.set(m.property_id, (m.thumb_path ?? m.storage_path) as string);
  }
  return out;
}

export async function getFavoriteIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("favorites").select("property_id");
  return new Set((data ?? []).map((f) => f.property_id as string));
}

export function financingLabels(f: Listing["financing"]): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.bankFinancing) out.push("Bank financing");
  if (f.pagIbig) out.push("Pag-IBIG");
  if (f.inHouse) out.push("In-house");
  return out;
}
