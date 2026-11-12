"use server";

import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { runPipelineKeeper } from "@/lib/agent-runs";
import { requireBusiness, requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendAsTeam, type TeamConversation } from "@/lib/team-send";

const UUID = /^[0-9a-f-]{36}$/i;

function refresh(prospectId?: string | null) {
  revalidatePath("/app/agents");
  revalidatePath("/app/pipeline");
  if (prospectId) revalidatePath(`/app/pipeline/${prospectId}`);
  revalidatePath("/app", "layout");
}

/**
 * The task, if the signed-in teammate can act on it. Reading through the user's
 * client means RLS decides visibility; writes then use the service role, scoped
 * to the same business and guarded on status so a task is only handled once.
 */
async function ownTask(id: string) {
  const biz = await requireBusiness();
  const user = await requireUser();
  if (!can(biz.role, "lead.update") || !UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_tasks")
    .select("id, business_id, kind, title, draft, prospect_id, conversation_id, status")
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .eq("status", "proposed")
    .maybeSingle();
  const admin = createAdminClient();
  return data && admin ? { biz, user, task: data, admin } : null;
}

async function logOnProspect(admin: NonNullable<ReturnType<typeof createAdminClient>>, businessId: string, prospectId: string | null, body: string, actor: string, touch: boolean) {
  if (!prospectId) return;
  await admin.from("prospect_events").insert({ business_id: businessId, prospect_id: prospectId, kind: "task", body: body.slice(0, 1000), actor });
  if (touch) await admin.from("prospects").update({ last_activity_at: new Date().toISOString() }).eq("id", prospectId).eq("business_id", businessId);
}

/** A reminder the teammate has taken care of. Counts as activity on the lead. */
export async function completeTask(id: string) {
  const found = await ownTask(id);
  if (!found) return;
  const { biz, user, task, admin } = found;
  const { data } = await admin
    .from("agent_tasks")
    .update({ status: "done", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("business_id", biz.businessId)
    .eq("status", "proposed")
    .select("id");
  if (data?.length) await logOnProspect(admin, biz.businessId, task.prospect_id, `Done: ${task.title}`, user.id, true);
  refresh(task.prospect_id);
}

export async function dismissTask(id: string) {
  const found = await ownTask(id);
  if (!found) return;
  const { biz, user, task, admin } = found;
  await admin
    .from("agent_tasks")
    .update({ status: "dismissed", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("business_id", biz.businessId)
    .eq("status", "proposed");
  refresh(task.prospect_id);
}

/** Send an approved draft (as edited) in the lead's chat. */
export async function sendTask(id: string, form: FormData) {
  const found = await ownTask(id);
  if (!found || found.task.kind !== "message" || !found.task.conversation_id) return;
  const { biz, user, task, admin } = found;
  const text = str(form, "text").trim();
  if (!can(biz.role, "conversation.reply") || !text) return;
  const { data: claimed } = await admin
    .from("agent_tasks")
    .update({ status: "sending", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("business_id", biz.businessId)
    .eq("status", "proposed")
    .select("id");
  if (!claimed?.length) return refresh(task.prospect_id);

  const { data: conv } = await admin
    .from("messenger_conversations")
    .select("id, channel, page_row_id, psid, last_inbound_at")
    .eq("id", task.conversation_id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  const res = conv ? await sendAsTeam(admin, biz.businessId, conv as TeamConversation, text, user.id) : { error: "This chat no longer exists." };
  await admin
    .from("agent_tasks")
    .update(res.error ? { status: "failed", error: res.error.slice(0, 300) } : { status: "done", draft: text.slice(0, 2000) })
    .eq("id", task.id);
  if (!res.error) await logOnProspect(admin, biz.businessId, task.prospect_id, `Sent: ${text}`, user.id, false);
  refresh(task.prospect_id);
}

export type SettingsState = { error?: string; saved?: number };

export async function saveAgentSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const biz = await requireBusiness();
  const user = await requireUser();
  if (!can(biz.role, "lead.assign")) return { error: "Only owners and admins can change this." };
  const days = Number(str(form, "followUpDays"));
  if (!Number.isInteger(days) || days < 1 || days > 30) return { error: "Pick between 1 and 30 days." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_settings")
    .upsert({ business_id: biz.businessId, enabled: form.get("enabled") === "on", follow_up_days: days, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't save. Please try again." };
  refresh();
  return { saved: Date.now() };
}

export type RunState = { error?: string; summary?: string };

/** Run the agents now instead of waiting for tomorrow morning. */
export async function runAgentsNow(): Promise<RunState> {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.assign")) return { error: "Only owners and admins can run the agents." };
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "agents_run_now", p_limit: 6, p_window_seconds: 3600 });
  if (allowed !== true) return { error: "You've run the agents several times this hour. Try again later." };
  const admin = createAdminClient();
  if (!admin) return { error: "The agents aren't available right now." };
  const res = await runPipelineKeeper(admin, biz.businessId, "manual");
  refresh();
  return res.ok ? { summary: res.proposed ? `${res.summary} ${res.proposed} new suggestion${res.proposed === 1 ? "" : "s"} below.` : res.summary } : { error: res.summary };
}
