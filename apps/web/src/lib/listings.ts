import "server-only";
import type { PROPERTY_TYPES } from "@proppilot/shared";
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
};

function normalize(rows: unknown[] | null): Listing[] {
  return (rows ?? []).map((r) => {
    const l = r as Listing;
    return {
      ...l,
      price_minor: Number(l.price_minor),
      reservation_fee_minor: l.reservation_fee_minor === null ? null : Number(l.reservation_fee_minor),
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
