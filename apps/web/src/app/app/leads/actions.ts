"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { syncLeadsSheet, syncViewingEvent } from "@/lib/lead-jobs";
import { manilaInputToIso } from "@/lib/leads";
import { str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["new", "contacted", "scheduled", "completed", "closed"] as const;

export async function updateLead(id: string, form: FormData) {
  const user = await requireUser();
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.update")) return;
  const status = str(form, "status");
  if (!(STATUSES as readonly string[]).includes(status)) return;
  const note = str(form, "agentNote").trim().slice(0, 1000);
  // Viewing time is typed in Philippine time; an empty field clears it.
  const scheduledAt = manilaInputToIso(str(form, "scheduledAt"));
  const supabase = await createClient();
  // RLS limits this to the business's own requests; the database keeps the buyer's details unchanged.
  const { data } = await supabase
    .from("viewing_requests")
    .update({ status, agent_note: note || null, scheduled_at: scheduledAt })
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .select("id");
  revalidatePath("/app/leads");
  revalidatePath("/app");
  if (data?.length) {
    after(async () => {
      await syncViewingEvent(id, user.id);
      await syncLeadsSheet(biz.businessId);
    });
  }
}
