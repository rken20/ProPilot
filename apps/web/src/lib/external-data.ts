import "server-only";
import { PROPERTY_TYPES } from "@propilot/shared";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { pesosToCentavos } from "./money";
import type { ExternalListing, SearchFilters } from "./external-listings";

/** Searching other sites needs the Claude key (to search) and the service role (to store). */
export function onlineSearchEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Read and clean the buyer's search filters, from the URL or a form. */
export function parseFilters(get: (name: string) => unknown): SearchFilters & { max: string } {
  const raw = (n: string) => (typeof get(n) === "string" ? (get(n) as string) : "");
  const q = raw("q").trim().slice(0, 80);
  const type = (PROPERTY_TYPES as readonly string[]).includes(raw("type")) ? raw("type") : "";
  const max = /^\d{1,11}$/.test(raw("max")) ? raw("max") : "";
  const maxMinor = max ? pesosToCentavos(max) : null;
  return { q, type, max, maxPriceMinor: maxMinor && Number.isFinite(maxMinor) ? maxMinor : undefined };
}

export const CACHE_HOURS = 24;
const LISTING_COLUMNS =
  "id, source_url, source_name, title, type, location, price_minor, currency, bedrooms, floor_area_sqm, last_seen_at";

/** Listings a search with this key returned in the last day, best match first. */
export async function getCachedOnline(key: string): Promise<{ listings: ExternalListing[]; searchedAt: string | null }> {
  const admin = createAdminClient();
  if (!admin) return { listings: [], searchedAt: null };
  const since = new Date(Date.now() - CACHE_HOURS * 3600_000).toISOString();
  const { data } = await admin
    .from("external_searches")
    .select(`rank, searched_at, external_listings (${LISTING_COLUMNS})`)
    .eq("query_key", key)
    .gte("searched_at", since)
    .order("rank");
  const rows = (data ?? []) as unknown as Array<{ searched_at: string; external_listings: ExternalListing | null }>;
  return {
    listings: rows.flatMap((r) => (r.external_listings ? [r.external_listings] : [])),
    searchedAt: rows[0]?.searched_at ?? null,
  };
}

export async function getExternalFavoriteIds(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("external_favorites").select("listing_id");
  return new Set((data ?? []).map((f) => f.listing_id as string));
}

/** The buyer's saved listings from other sites, newest first. */
export async function getSavedExternal(): Promise<ExternalListing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("external_favorites")
    .select(`created_at, external_listings (${LISTING_COLUMNS})`)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as Array<{ external_listings: ExternalListing | null }>;
  return rows.flatMap((r) => (r.external_listings ? [r.external_listings] : []));
}
