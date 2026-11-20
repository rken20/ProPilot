import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manilaMonthStart, rankMatches, scoreMatch, type Match, type MatchListing } from "./matching";
import type { Facts } from "./qualification";

/**
 * Buyer Finder: which of the business's leads fit a listing. The AI qualifier
 * reads each chat for budget, areas, type and financing; the matcher then
 * scores every open lead against the listing. Adding one as a potential buyer
 * counts toward the plan's monthly allowance (Basic 5, Pro 20, Agency 60).
 *
 * Everything here is read with the signed-in person's client, so agents only
 * see the leads they're allowed to.
 */

export const FACT_COLUMNS = "budget_min_minor, budget_max_minor, areas, property_types, timeline, financing";
const SHOW = 8;

export type ListingForMatch = MatchListing & { id: string; business_id: string; status: string };

export type LeadMatch = {
  id: string;
  name: string;
  source: string;
  stage: string;
  temperature: string | null;
  match: Match | null;
};

export type BuyerFinderResult = {
  suggestions: LeadMatch[];
  added: LeadMatch[];
  usedThisMonth: number;
  limit: number | null;
};

export function factsOf(row: Record<string, unknown>): Facts {
  return {
    budget_min_minor: row.budget_min_minor === null || row.budget_min_minor === undefined ? null : Number(row.budget_min_minor),
    budget_max_minor: row.budget_max_minor === null || row.budget_max_minor === undefined ? null : Number(row.budget_max_minor),
    areas: (row.areas as string[] | null) ?? [],
    property_types: (row.property_types as string[] | null) ?? [],
    timeline: (row.timeline as Facts["timeline"]) ?? null,
    financing: (row.financing as Facts["financing"]) ?? null,
  };
}

/** Buyer Finder adds this month, for the plan allowance. */
export async function buyerFinderUsed(supabase: SupabaseClient, businessId: string): Promise<number> {
  const { count } = await supabase
    .from("listing_matches")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", manilaMonthStart());
  return count ?? 0;
}

const leadOf = (r: Record<string, unknown>, match: Match | null): LeadMatch => ({
  id: r.id as string,
  name: (r.name as string | null) || "Unnamed lead",
  source: r.source as string,
  stage: r.stage as string,
  temperature: (r.temperature as string | null) ?? null,
  match,
});

export async function buyerFinder(supabase: SupabaseClient, listing: ListingForMatch, limit: number | null): Promise<BuyerFinderResult> {
  const [leads, matches, used] = await Promise.all([
    supabase
      .from("prospects")
      .select(`id, name, source, stage, temperature, ${FACT_COLUMNS}`)
      .eq("business_id", listing.business_id)
      .not("stage", "in", "(won,lost)")
      .order("last_activity_at", { ascending: false })
      .limit(1000),
    supabase.from("listing_matches").select("prospect_id").eq("property_id", listing.id),
    buyerFinderUsed(supabase, listing.business_id),
  ]);
  const addedIds = new Set((matches.data ?? []).map((m) => m.prospect_id as string));
  const rows = (leads.data ?? []) as Array<Record<string, unknown>>;
  const suggestions = rankMatches(
    rows.filter((r) => !addedIds.has(r.id as string)),
    (r) => scoreMatch(listing, factsOf(r)),
    SHOW,
  ).map(({ item, match }) => leadOf(item, match));
  const added = rows.filter((r) => addedIds.has(r.id as string)).map((r) => leadOf(r, scoreMatch(listing, factsOf(r))));
  return { suggestions, added, usedThisMonth: used, limit };
}
