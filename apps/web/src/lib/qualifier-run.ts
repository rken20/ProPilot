import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { OPEN_STAGES } from "@/lib/pipeline";
import {
  hasSignal,
  mergeFacts,
  missingFrom,
  qualifierTasks,
  qualify,
  temperatureFor,
  TEMPERATURE_LABEL,
  type Facts,
  type Preferences,
  type QualifyContext,
} from "@/lib/qualification";
import type { HelperTurn } from "@/lib/reply-helper";

/**
 * Runs the lead qualifier with the service-role client. Every query is scoped
 * to `businessId`. Names, phone numbers and emails are not sent to the AI.
 */

const PROSPECT_COLS =
  "id, business_id, name, stage, source, buyer_id, property_id, temperature, facts_by, budget_min_minor, budget_max_minor, areas, property_types, timeline, financing";

type ProspectRow = {
  id: string;
  name: string | null;
  stage: string;
  source: string;
  buyer_id: string | null;
  property_id: string | null;
  temperature: string | null;
  facts_by: string | null;
} & Facts;

export function anthropicFromEnv() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? { client: new Anthropic({ apiKey }), model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL } : null;
}

async function loadContext(admin: SupabaseClient, businessId: string, p: ProspectRow, now: Date): Promise<QualifyContext> {
  const [listing, prefs, requests, convs, notes] = await Promise.all([
    p.property_id
      ? admin.from("properties").select("name, location, type, price_minor").eq("id", p.property_id).eq("business_id", businessId).maybeSingle()
      : Promise.resolve({ data: null }),
    p.buyer_id
      ? admin
          .from("buyer_preferences")
          .select("budget_min_minor, budget_max_minor, areas, property_types, timeline, financing, bedrooms_min, must_haves")
          .eq("user_id", p.buyer_id)
          .eq("share_with_agents", true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("viewing_requests")
      .select("created_at, preferred_date, budget_note, message")
      .eq("prospect_id", p.id)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin.from("messenger_conversations").select("id").eq("prospect_id", p.id).eq("business_id", businessId).limit(5),
    admin
      .from("prospect_events")
      .select("body")
      .eq("prospect_id", p.id)
      .eq("business_id", businessId)
      .eq("kind", "note")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const convIds = (convs.data ?? []).map((c) => c.id as string);
  const { data: msgs } = convIds.length
    ? await admin
        .from("messenger_messages")
        .select("sender, body, created_at")
        .in("conversation_id", convIds)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(40)
    : { data: [] as Array<{ sender: string; body: string; created_at: string }> };

  return {
    today: now.toISOString().slice(0, 10),
    stage: p.stage,
    source: p.source,
    listing: (listing.data as QualifyContext["listing"]) ?? null,
    facts: factsOf(p),
    preferences: (prefs.data as Preferences | null) ?? null,
    requests: (requests.data ?? []) as QualifyContext["requests"],
    chat: (msgs ?? []).reverse().map((m) => ({ from: m.sender as HelperTurn["from"], text: m.body as string })),
    notes: (notes.data ?? []).map((n) => n.body as string).reverse(),
  };
}

function factsOf(p: Facts): Facts {
  return {
    budget_min_minor: p.budget_min_minor,
    budget_max_minor: p.budget_max_minor,
    areas: p.areas ?? [],
    property_types: p.property_types ?? [],
    timeline: p.timeline,
    financing: p.financing,
  };
}

/** Qualify one lead. Returns false when the AI couldn't answer, so the lead stays in line for the next run. */
export async function qualifyProspect(
  admin: SupabaseClient,
  ai: NonNullable<ReturnType<typeof anthropicFromEnv>>,
  businessId: string,
  prospectId: string,
  now = new Date(),
): Promise<{ ok: boolean; proposed: number }> {
  const { data } = await admin.from("prospects").select(PROSPECT_COLS).eq("id", prospectId).eq("business_id", businessId).maybeSingle();
  if (!data) return { ok: false, proposed: 0 };
  const p = data as ProspectRow;
  // Claim it first: anything new that arrives while the AI is reading sets the flag again.
  await admin.from("prospects").update({ needs_qualify: false }).eq("id", p.id).eq("business_id", businessId);

  const ctx = await loadContext(admin, businessId, p, now);
  if (!hasSignal(ctx)) return { ok: true, proposed: 0 };

  let q;
  try {
    q = await qualify(ai.client, ai.model, ctx);
  } catch (e) {
    console.error("[agents] qualify failed:", e instanceof Error ? e.message : String(e));
    q = null;
  }
  if (!q) {
    await admin.from("prospects").update({ needs_qualify: true }).eq("id", p.id).eq("business_id", businessId);
    return { ok: false, proposed: 0 };
  }

  const teamFacts = p.facts_by === "team";
  const facts = teamFacts ? factsOf(p) : mergeFacts(factsOf(p), q.facts);
  const temperature = temperatureFor(q.score);
  await admin
    .from("prospects")
    .update({
      ...(teamFacts ? {} : { ...facts, facts_by: "ai" }),
      score: q.score,
      temperature,
      score_reason: q.reason || null,
      missing: missingFrom(facts),
      qualified_at: now.toISOString(),
    })
    .eq("id", p.id)
    .eq("business_id", businessId);

  if (temperature !== p.temperature) {
    await admin.from("prospect_events").insert({
      business_id: businessId,
      prospect_id: p.id,
      kind: "task",
      body: `Lead qualifier rated this lead ${TEMPERATURE_LABEL[temperature]} (${q.score}/100)${q.reason ? `: ${q.reason}` : ""}`.slice(0, 1000),
    });
  }

  let proposed = 0;
  for (const t of qualifierTasks(p, q)) {
    // Don't repeat a suggestion the team dismissed or acted on in the last two weeks.
    const { data: recent } = await admin
      .from("agent_tasks")
      .select("id")
      .eq("business_id", businessId)
      .eq("dedupe_key", t.dedupe_key)
      .gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .limit(1);
    if (recent?.length) continue;
    const { error } = await admin.from("agent_tasks").insert({
      business_id: businessId,
      prospect_id: p.id,
      agent: "qualifier",
      kind: t.kind,
      title: t.title.slice(0, 160),
      reason: t.reason.slice(0, 500),
      dedupe_key: t.dedupe_key,
      proposed_stage: t.proposed_stage ?? null,
      due_at: now.toISOString(),
    });
    if (!error) proposed++;
  }
  return { ok: true, proposed };
}

/**
 * Qualify the leads that have something new, a few at a time, until `limit` or
 * the time budget runs out. What's left waits for the next run.
 */
export async function runQualifier(
  admin: SupabaseClient,
  businessId: string,
  trigger: "schedule" | "manual",
  opts: { limit: number; deadline: number },
): Promise<{ ok: boolean; checked: number; proposed: number; summary: string }> {
  const ai = anthropicFromEnv();
  if (!ai) return { ok: true, checked: 0, proposed: 0, summary: "" };
  const { data: queue } = await admin
    .from("prospects")
    .select("id")
    .eq("business_id", businessId)
    .eq("needs_qualify", true)
    .in("stage", [...OPEN_STAGES])
    .order("last_activity_at", { ascending: false })
    .limit(opts.limit);
  if (!queue?.length) return { ok: true, checked: 0, proposed: 0, summary: "" };

  const { data: run } = await admin.from("agent_runs").insert({ business_id: businessId, agent: "qualifier", trigger }).select("id").single();
  let checked = 0;
  let proposed = 0;
  let failed = 0;
  const ids = queue.map((r) => r.id as string);
  for (let i = 0; i < ids.length && Date.now() < opts.deadline; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map((id) => qualifyProspect(admin, ai, businessId, id)));
    for (const r of batch) {
      if (r.ok) checked++;
      else failed++;
      proposed += r.proposed;
    }
  }
  const left = ids.length - checked - failed;
  const summary =
    `Checked ${checked} lead${checked === 1 ? "" : "s"}` +
    (proposed ? `, ${proposed} suggestion${proposed === 1 ? "" : "s"}` : "") +
    (left > 0 ? `. ${left} more next run` : "") +
    (failed ? `. ${failed} couldn't be read and will be tried again` : "") +
    ".";
  if (run)
    await admin
      .from("agent_runs")
      .update({ status: failed && !checked ? "error" : "ok", summary, proposed, finished_at: new Date().toISOString() })
      .eq("id", run.id);
  return { ok: !(failed && !checked), checked, proposed, summary };
}
