import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { basicBuyers, FACT_COLUMNS, factsOf } from "@/lib/buyer-finder";
import { emailUser } from "@/lib/billing-email";
import { rankMatches, scoreMatch } from "@/lib/matching";
import { matcherProposals, matcherSummary, type MatcherChat, type MatcherLead, type MatcherListing } from "@/lib/matcher";
import { formatPeso } from "@/lib/money";
import { OPEN_STAGES } from "@/lib/pipeline";
import { aiEnabled } from "@/lib/plan";

/**
 * The Property matcher agent (Basic): suggests listings for open leads, into the
 * approval queue. Uses the service-role client; every query is scoped to the business.
 */
export async function runMatcher(
  admin: SupabaseClient,
  businessId: string,
  trigger: "schedule" | "manual",
  now = new Date(),
): Promise<{ ok: boolean; proposed: number; summary: string }> {
  if (!(await aiEnabled(businessId))) return { ok: true, proposed: 0, summary: "" };
  const { data: run } = await admin.from("agent_runs").insert({ business_id: businessId, agent: "matcher", trigger }).select("id").single();
  const finish = async (status: "ok" | "error", summary: string, proposed = 0) => {
    if (run) await admin.from("agent_runs").update({ status, summary, proposed, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: status === "ok", proposed, summary };
  };
  try {
    const [leads, listings, chats, suggested] = await Promise.all([
      admin
        .from("prospects")
        .select(`id, name, property_id, ${FACT_COLUMNS}`)
        .eq("business_id", businessId)
        .in("stage", [...OPEN_STAGES])
        .order("last_activity_at", { ascending: false })
        .limit(1000),
      admin.from("properties").select("id, name, type, location, price_minor, financing").eq("business_id", businessId).eq("status", "available").limit(1000),
      admin
        .from("messenger_conversations")
        .select("id, prospect_id, channel, last_inbound_at, last_message_at")
        .eq("business_id", businessId)
        .not("prospect_id", "is", null)
        .limit(5000),
      admin.from("agent_tasks").select("dedupe_key").eq("business_id", businessId).eq("agent", "matcher").like("dedupe_key", "match:%").limit(20000),
    ]);
    const err = leads.error ?? listings.error ?? chats.error ?? suggested.error;
    if (err) throw new Error(err.message);

    const proposals = matcherProposals({
      leads: (leads.data ?? []).map((r) => ({ ...factsOf(r), id: r.id as string, name: (r.name as string | null) ?? null, property_id: (r.property_id as string | null) ?? null }) as MatcherLead),
      listings: (listings.data ?? []).map((l) => ({ ...l, price_minor: Number(l.price_minor) }) as MatcherListing),
      chats: (chats.data ?? []) as MatcherChat[],
      suggested: new Set((suggested.data ?? []).map((r) => r.dedupe_key as string)),
      now,
    });
    let added = 0;
    for (const p of proposals) {
      const { error } = await admin.from("agent_tasks").insert({ ...p, business_id: businessId });
      if (!error) added++;
      else if (error.code !== "23505") throw new Error(error.message);
    }
    return await finish("ok", matcherSummary(added), added);
  } catch (e) {
    console.error("[agents] matcher failed:", e instanceof Error ? e.message : String(e));
    return finish("error", "The run stopped with an error. It will try again tomorrow.");
  }
}

/**
 * Match alert emails for buyers on Basic who turned them on: new Home Finder
 * listings that fit their search since the last email (or the last week).
 */
export async function runMatchAlerts(admin: SupabaseClient, origin: string, now = new Date()): Promise<number> {
  const { data: prefs } = await admin
    .from("buyer_preferences")
    .select(`user_id, match_alerts_sent_at, ${FACT_COLUMNS}`)
    .eq("match_alerts", true)
    .limit(2000);
  if (!prefs?.length) return 0;
  const paid = await basicBuyers(admin, prefs.map((p) => p.user_id as string));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: listings } = await admin
    .from("properties")
    .select("id, name, type, location, price_minor, financing, created_at")
    .eq("is_public", true)
    .eq("status", "available")
    .gte("created_at", weekAgo)
    .limit(2000);
  if (!listings?.length) return 0;

  let sent = 0;
  for (const p of prefs) {
    if (!paid.has(p.user_id as string)) continue;
    const since = (p.match_alerts_sent_at as string | null) ?? weekAgo;
    const fresh = listings.filter((l) => (l.created_at as string) > since).map((l) => ({ ...l, price_minor: Number(l.price_minor) }));
    const top = rankMatches(fresh, (l) => scoreMatch(l as MatcherListing, factsOf(p)), 5);
    if (!top.length) continue;
    await emailUser(
      admin,
      p.user_id as string,
      top.length === 1 ? "A new listing fits your search" : `${top.length} new listings fit your search`,
      top.map(({ item, match }) => [item.name as string, `${formatPeso(item.price_minor)}, ${item.location}. ${match.score}% match`]),
      { label: "See them on Home Finder", url: `${origin}/buyer/my-search` },
    );
    await admin.from("buyer_preferences").update({ match_alerts_sent_at: now.toISOString() }).eq("user_id", p.user_id);
    sent++;
  }
  return sent;
}
