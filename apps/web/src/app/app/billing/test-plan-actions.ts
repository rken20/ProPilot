"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { str } from "@/lib/form";
import { FREE_PLAN, PAID_PLANS } from "@/lib/plan-rules";
import { requireSuperAdmin } from "@/lib/superadmin";

/**
 * Super admins only: put the business they're signed in to on any plan at once,
 * without a payment, to try each plan's features. Anyone else gets a 404.
 */
export async function switchTestPlan(form: FormData): Promise<void> {
  const { admin } = await requireSuperAdmin();
  // The business comes from the super admin's own membership, never from the form.
  const biz = await requireBusiness();
  const code = str(form, "plan");

  if (code === FREE_PLAN) {
    // No subscription means Free.
    await admin.from("subscriptions").delete().eq("business_id", biz.businessId);
  } else if ((PAID_PLANS as readonly string[]).includes(code)) {
    const { data: plan } = await admin.from("plans").select("id").eq("code", code).eq("is_active", true).maybeSingle();
    if (!plan) return;
    const now = new Date();
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 1);
    await admin
      .from("subscriptions")
      .upsert(
        { business_id: biz.businessId, plan_id: plan.id, current_period_start: now.toISOString(), current_period_end: end.toISOString(), updated_at: now.toISOString() },
        { onConflict: "business_id" },
      );
  } else {
    return;
  }
  revalidatePath("/app", "layout");
}
