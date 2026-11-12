"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { manilaInputToIso } from "@/lib/leads";
import { pesosToCentavos } from "@/lib/money";
import { isKind, isStage } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";

export type ProspectFormState = { error?: string; saved?: number };

const UUID = /^[0-9a-f-]{36}$/i;
const clip = (v: string, n: number) => v.trim().slice(0, n) || null;

async function salesTeam() {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.update")) return null;
  return biz;
}

function refresh(id?: string) {
  revalidatePath("/app/pipeline");
  if (id) revalidatePath(`/app/pipeline/${id}`);
  revalidatePath("/app/agents");
}

/** Add someone the team already knows (a walk-in, a referral, a past client). */
export async function createProspect(_prev: ProspectFormState, form: FormData): Promise<ProspectFormState> {
  const biz = await salesTeam();
  if (!biz) return { error: "You can't add leads in this business." };
  const name = clip(str(form, "name"), 120);
  const phone = clip(str(form, "phone"), 40);
  const email = clip(str(form, "email"), 200);
  if (!name) return { error: "Add their name." };
  if (!phone && !email) return { error: "Add a phone number or email so the team can reach them." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  const kind = str(form, "kind");
  const stage = str(form, "stage") || "inquiry";
  const propertyId = str(form, "propertyId");
  const note = clip(str(form, "note"), 1000);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .insert({
      business_id: biz.businessId,
      name,
      phone,
      email,
      kind: isKind(kind) ? kind : "buyer",
      stage: isStage(stage) && stage !== "won" && stage !== "lost" ? stage : "inquiry",
      property_id: UUID.test(propertyId) ? propertyId : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add them. Check the details and try again." };
  const user = await requireUser();
  if (note) await supabase.from("prospect_events").insert({ business_id: biz.businessId, prospect_id: data.id, kind: "note", body: note, actor: user.id });
  refresh();
  redirect(`/app/pipeline/${data.id}`);
}

/** Stage, deal value, next step and contact details. The database keeps the protected fields. */
export async function updateProspect(id: string, _prev: ProspectFormState, form: FormData): Promise<ProspectFormState> {
  const biz = await salesTeam();
  if (!biz || !UUID.test(id)) return { error: "You can't change this lead." };
  const stage = str(form, "stage");
  if (!isStage(stage)) return { error: "Pick a stage." };
  const kind = str(form, "kind");
  const value = pesosToCentavos(str(form, "dealValue"));
  if (Number.isNaN(value)) return { error: "Type the deal value in pesos, e.g. 4500000." };
  const name = clip(str(form, "name"), 120);
  if (!name) return { error: "Add their name." };
  const email = clip(str(form, "email"), 200);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn't look right." };
  const propertyId = str(form, "propertyId");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .update({
      name,
      phone: clip(str(form, "phone"), 40),
      email,
      kind: isKind(kind) ? kind : "buyer",
      stage,
      lost_reason: stage === "lost" ? clip(str(form, "lostReason"), 200) : null,
      deal_value_minor: value,
      property_id: UUID.test(propertyId) ? propertyId : null,
      next_step: clip(str(form, "nextStep"), 200),
      next_step_at: manilaInputToIso(str(form, "nextStepAt")),
    })
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't save. Please try again." };
  refresh(id);
  return { saved: Date.now() };
}

/** Owners and admins assign anyone on the team; agents can take a lead themselves. */
export async function assignProspect(id: string, form: FormData) {
  const biz = await salesTeam();
  const user = await requireUser();
  if (!biz || !UUID.test(id)) return;
  const to = str(form, "assignee");
  const assignee = to === "me" ? user.id : UUID.test(to) ? to : null;
  if (assignee && assignee !== user.id && !can(biz.role, "lead.assign")) return;
  const supabase = await createClient();
  await supabase.from("prospects").update({ assigned_to: assignee }).eq("id", id).eq("business_id", biz.businessId);
  refresh(id);
}

export async function addProspectNote(id: string, form: FormData) {
  const biz = await salesTeam();
  const user = await requireUser();
  const body = str(form, "note").trim().slice(0, 1000);
  if (!biz || !UUID.test(id) || !body) return;
  const supabase = await createClient();
  await supabase.from("prospect_events").insert({ business_id: biz.businessId, prospect_id: id, kind: "note", body, actor: user.id });
  refresh(id);
}

export async function deleteProspect(id: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.assign") || !UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("prospects").delete().eq("id", id).eq("business_id", biz.businessId);
  refresh();
  redirect("/app/pipeline");
}
