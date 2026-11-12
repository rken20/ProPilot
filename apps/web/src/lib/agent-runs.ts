import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-info";
import { keeperProposals, keeperSummary, OPEN_STAGES, type KeeperRequest } from "@/lib/pipeline";

/**
 * Runs the AI agents for one business with the service-role client. Every query
 * is scoped to `businessId`. Agents only add proposals to the approval queue.
 */

export async function loadAgentSettings(admin: SupabaseClient, businessId: string) {
  const { data } = await admin.from("agent_settings").select("enabled, follow_up_days").eq("business_id", businessId).maybeSingle();
  return { ...DEFAULT_AGENT_SETTINGS, ...(data ?? {}) };
}

export async function runPipelineKeeper(
  admin: SupabaseClient,
  businessId: string,
  trigger: "schedule" | "manual",
  now = new Date(),
): Promise<{ ok: boolean; proposed: number; summary: string }> {
  const { data: run } = await admin.from("agent_runs").insert({ business_id: businessId, agent: "pipeline", trigger }).select("id").single();
  const finish = async (status: "ok" | "error", summary: string, proposed = 0) => {
    if (run) await admin.from("agent_runs").update({ status, summary, proposed, finished_at: new Date().toISOString() }).eq("id", run.id);
    return { ok: status === "ok", proposed, summary };
  };

  try {
    const settings = await loadAgentSettings(admin, businessId);
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const [prospects, requests, recent] = await Promise.all([
      admin
        .from("prospects")
        .select("id, name, stage, last_activity_at, next_step, next_step_at")
        .eq("business_id", businessId)
        .in("stage", [...OPEN_STAGES])
        .order("last_activity_at")
        .limit(1000),
      admin
        .from("viewing_requests")
        .select("id, buyer_name, property_id, created_at, prospect_id")
        .eq("business_id", businessId)
        .eq("status", "new")
        .lte("created_at", dayAgo)
        .limit(200),
      admin
        .from("agent_tasks")
        .select("dedupe_key, status, decided_at, created_at")
        .eq("business_id", businessId)
        .eq("agent", "pipeline")
        .gte("created_at", monthAgo)
        .limit(2000),
    ]);
    if (prospects.error || requests.error || recent.error) throw new Error((prospects.error ?? requests.error ?? recent.error)!.message);

    const propIds = [...new Set((requests.data ?? []).map((r) => r.property_id as string))];
    const { data: props } = propIds.length
      ? await admin.from("properties").select("id, name").eq("business_id", businessId).in("id", propIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const propName = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));
    const newRequests: KeeperRequest[] = (requests.data ?? []).map((r) => ({
      id: r.id as string,
      buyer_name: r.buyer_name as string,
      property_name: propName.get(r.property_id as string) ?? null,
      created_at: r.created_at as string,
      prospect_id: (r.prospect_id as string | null) ?? null,
    }));

    const proposals = keeperProposals({
      prospects: prospects.data ?? [],
      newRequests,
      recent: recent.data ?? [],
      followUpDays: settings.follow_up_days,
      now,
    });
    let added = 0;
    for (const p of proposals) {
      // One at a time so a proposal that already exists (unique key) doesn't block the rest.
      const { error } = await admin.from("agent_tasks").insert({ ...p, business_id: businessId });
      if (!error) added++;
      else if (error.code !== "23505") throw new Error(error.message);
    }
    return await finish("ok", keeperSummary(proposals), added);
  } catch (e) {
    console.error("[agents] pipeline keeper failed:", e instanceof Error ? e.message : String(e));
    return finish("error", "The run stopped with an error. It will try again tomorrow.");
  }
}

/** The daily run for every business that has its agents switched on. */
export async function runScheduledAgents(admin: SupabaseClient): Promise<{ businesses: number; proposed: number; failed: number }> {
  const [{ data: businesses }, { data: off }] = await Promise.all([
    admin.from("businesses").select("id").limit(5000),
    admin.from("agent_settings").select("business_id").eq("enabled", false),
  ]);
  const disabled = new Set((off ?? []).map((r) => r.business_id as string));
  let proposed = 0;
  let failed = 0;
  let count = 0;
  for (const b of businesses ?? []) {
    if (disabled.has(b.id as string)) continue;
    count++;
    const res = await runPipelineKeeper(admin, b.id as string, "schedule");
    proposed += res.proposed;
    if (!res.ok) failed++;
  }
  await admin.rpc("prune_pipeline");
  return { businesses: count, proposed, failed };
}
