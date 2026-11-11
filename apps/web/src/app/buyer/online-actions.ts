"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getCachedOnline, onlineSearchEnabled, parseFilters } from "@/lib/external-data";
import { queryKey } from "@/lib/external-listings";
import { searchOtherSites } from "@/lib/external-search";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OnlineState = { error?: string; found?: number };

/** Search public property sites for the buyer's current filters and store what's found. */
export async function searchOnline(_prev: OnlineState, form: FormData): Promise<OnlineState> {
  await requireUser();
  const filters = parseFilters((n) => form.get(n));
  if (filters.q.length < 2) return { error: "Type a city or area first." };

  const admin = createAdminClient();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!onlineSearchEnabled() || !admin || !apiKey) {
    return { error: "Searching other sites isn't switched on yet." };
  }

  const key = queryKey(filters);
  const cached = await getCachedOnline(key);
  if (cached.listings.length) {
    revalidatePath("/buyer");
    return { found: cached.listings.length };
  }

  // Each search costs money, so cap it per buyer (shared across server instances).
  const supabase = await createClient();
  const [hour, day] = await Promise.all([
    supabase.rpc("consume_rate_limit", { p_bucket: "online_search_hour", p_limit: 5, p_window_seconds: 3600 }),
    supabase.rpc("consume_rate_limit", { p_bucket: "online_search_day", p_limit: 15, p_window_seconds: 86400 }),
  ]);
  if (hour.error || day.error || hour.data !== true || day.data !== true) {
    return { error: "You've searched other sites a lot today. Please try again later." };
  }

  let found;
  try {
    const model = process.env.ANTHROPIC_SEARCH_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    found = await searchOtherSites(new Anthropic({ apiKey }), model, filters);
  } catch (e) {
    console.error("online search failed", e instanceof Error ? e.message : e);
    return { error: "Couldn't search other sites just now. Please try again in a minute." };
  }
  if (!found.length) return { found: 0 };

  const now = new Date().toISOString();
  const { data: rows, error } = await admin
    .from("external_listings")
    .upsert(
      found.map((l) => ({ ...l, last_seen_at: now })),
      { onConflict: "source_url" },
    )
    .select("id, source_url");
  if (error || !rows) {
    console.error("storing online results failed", error?.message);
    return { error: "Couldn't save the results. Please try again." };
  }
  const idByUrl = new Map(rows.map((r) => [r.source_url as string, r.id as string]));
  await admin.from("external_searches").upsert(
    found.flatMap((l, rank) => {
      const id = idByUrl.get(l.source_url);
      return id ? [{ query_key: key, listing_id: id, rank, searched_at: now }] : [];
    }),
    { onConflict: "query_key,listing_id" },
  );
  await admin.rpc("prune_external_listings");

  revalidatePath("/buyer");
  return { found: found.length };
}

export async function toggleExternalFavorite(listingId: string, saved: boolean) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return;
  const supabase = await createClient();
  if (saved) {
    await supabase.from("external_favorites").delete().eq("user_id", user.id).eq("listing_id", listingId);
  } else {
    await supabase.from("external_favorites").insert({ user_id: user.id, listing_id: listingId });
  }
  revalidatePath("/buyer", "layout");
}
