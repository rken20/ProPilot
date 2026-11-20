import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FACT_COLUMNS, factsOf } from "@/lib/buyer-finder";
import { matcherProposals, matcherSummary, type MatcherChat, type MatcherLead, type MatcherListing } from "@/lib/matcher";
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
