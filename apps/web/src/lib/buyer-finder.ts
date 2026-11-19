import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeSearch, manilaMonthStart, rankMatches, scoreMatch, type Match, type MatchListing } from "./matching";
import type { Facts } from "./qualification";
import { FREE_PLAN } from "./plan-rules";

/**
 * Buyer Finder: who fits a listing. Two groups:
 * - leads already in the business's pipeline (read with the signed-in person's
 *   client, so agents only see the leads they're allowed to), and
 * - Home Finder buyers who opted in, read with the service role. These leave the
 *   server as a search description and an opaque handle only: never a name, an
 *   email or even the buyer's id.
 */

export const FACT_COLUMNS = "budget_min_minor, budget_max_minor, areas, property_types, timeline, financing";
const SHOW = 8;

export type ListingForMatch = MatchListing & { id: string; business_id: string; is_public: boolean; status: string };

export type PipelineMatch = { id: string; name: string; stage: string; temperature: string | null; match: Match };
export type OpenBuyerMatch = { handle: string; search: string[]; match: Match; sent: boolean };
export type BuyerFinderResult = {
  pipeline: PipelineMatch[];
  buyers: OpenBuyerMatch[];
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

/** A per-listing handle for a buyer, so the browser can say "this one" without learning who it is. */
export function buyerHandle(propertyId: string, buyerId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!key) throw new Error("Buyer Finder needs the service role key.");
  return createHmac("sha256", key).update(`buyer-finder:${propertyId}:${buyerId}`).digest("base64url").slice(0, 22);
}

/** Opted-in Home Finder buyers who fit a listing, best first, with their ids (server use only). */
export async function openBuyersFor(listing: ListingForMatch, limit = SHOW) {
  const admin = createAdminClient();
  if (!admin) return [];
  const [prefs, known, members] = await Promise.all([
    admin.from("buyer_preferences").select(`user_id, ${FACT_COLUMNS}`).eq("open_to_agents", true).limit(5000),
    // Buyers this business already knows are in its pipeline instead.
    admin.from("prospects").select("buyer_id").eq("business_id", listing.business_id).not("buyer_id", "is", null).limit(10000),
    admin.from("business_members").select("user_id").eq("business_id", listing.business_id),
  ]);
  const skip = new Set([...(known.data ?? []).map((r) => r.buyer_id as string), ...(members.data ?? []).map((r) => r.user_id as string)]);
  const candidates = (prefs.data ?? []).filter((r) => !skip.has(r.user_id as string));
  // Matching is a Basic feature for buyers too: only buyers on a current paid plan are in the pool.
  const paid = await basicBuyers(admin, candidates.map((r) => r.user_id as string));
  const rows = candidates.filter((r) => paid.has(r.user_id as string));
  return rankMatches(rows, (r) => scoreMatch(listing, factsOf(r)), limit).map(({ item, match }) => ({
    buyerId: item.user_id as string,
    facts: factsOf(item),
    match,
  }));
}

/** Which of these buyers are on a paid plan with AI right now. */
export async function basicBuyers(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from("buyer_subscriptions")
      .select("user_id, plans!inner(code)")
      .in("user_id", ids.slice(i, i + 500))
      .neq("plans.code", FREE_PLAN)
      .gt("current_period_end", new Date().toISOString());
    for (const r of data ?? []) out.add(r.user_id as string);
  }
  return out;
}

export async function introductionsThisMonth(businessId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count } = await admin
    .from("buyer_introductions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", manilaMonthStart());
  return count ?? 0;
}

export async function buyerFinder(supabase: SupabaseClient, listing: ListingForMatch, limit: number | null): Promise<BuyerFinderResult> {
  const admin = createAdminClient();
  const [leads, open, used, sentRows] = await Promise.all([
    supabase
      .from("prospects")
      .select(`id, name, stage, temperature, ${FACT_COLUMNS}`)
      .eq("business_id", listing.business_id)
      .not("stage", "in", "(won,lost)")
      .limit(1000),
    listing.is_public && listing.status === "available" ? openBuyersFor(listing, 50) : Promise.resolve([]),
    introductionsThisMonth(listing.business_id),
    admin ? admin.from("buyer_introductions").select("buyer_id").eq("property_id", listing.id) : Promise.resolve({ data: [] }),
  ]);
  const sent = new Set((sentRows.data ?? []).map((r) => r.buyer_id as string));
  const pipeline = rankMatches(leads.data ?? [], (r) => scoreMatch(listing, factsOf(r)), SHOW).map(({ item, match }) => ({
    id: item.id as string,
    name: (item.name as string | null) || "Unnamed lead",
    stage: item.stage as string,
    temperature: (item.temperature as string | null) ?? null,
    match,
  }));
  // Not yet sent first, then the ones already sent, so the list stays useful.
  const buyers = [...open.filter((b) => !sent.has(b.buyerId)), ...open.filter((b) => sent.has(b.buyerId))].slice(0, SHOW).map((b) => ({
    handle: buyerHandle(listing.id, b.buyerId),
    search: describeSearch(b.facts),
    match: b.match,
    sent: sent.has(b.buyerId),
  }));
  return { pipeline, buyers, usedThisMonth: used, limit };
}
