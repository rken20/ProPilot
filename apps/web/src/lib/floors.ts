import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { floorProblem, type FloorProblem } from "./floor-rules";

/**
 * The business's for-sale listings that need the owner to set (or fix) the
 * AI's lowest price. Call only for owners and admins on plans with AI
 * negotiation: nobody else can read the prices.
 */
export async function listingsNeedingFloor(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Map<string, FloorProblem>> {
  const { data: listings } = await supabase
    .from("properties")
    .select("id, price_minor, status")
    .eq("business_id", businessId)
    .eq("status", "available");
  if (!listings?.length) return new Map();
  const { data: floors } = await supabase
    .from("listing_floors")
    .select("property_id, min_price_minor")
    .in(
      "property_id",
      listings.map((l) => l.id),
    );
  const min = new Map(
    (floors ?? []).map((f) => [
      f.property_id as string,
      Number(f.min_price_minor),
    ]),
  );
  const out = new Map<string, FloorProblem>();
  for (const l of listings) {
    const problem = floorProblem(
      l.status as string,
      min.get(l.id as string) ?? null,
      Number(l.price_minor),
    );
    if (problem) out.set(l.id as string, problem);
  }
  return out;
}
