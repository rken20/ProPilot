"use server";

import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["new", "contacted", "scheduled", "completed", "closed"] as const;

export async function updateLead(id: string, form: FormData) {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.update")) return;
  const status = str(form, "status");
  if (!(STATUSES as readonly string[]).includes(status)) return;
  const note = str(form, "agentNote").trim().slice(0, 1000);
  const supabase = await createClient();
  // RLS limits this to the business's own requests; the database keeps the buyer's details unchanged.
  await supabase
    .from("viewing_requests")
    .update({ status, agent_note: note || null })
    .eq("id", id)
    .eq("business_id", biz.businessId);
  revalidatePath("/app/leads");
  revalidatePath("/app");
}
