"use server";

import { revalidatePath } from "next/cache";
import { getOrigin } from "@/lib/auth";
import { emailOwners, emailUser } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { requireSuperAdmin } from "@/lib/superadmin";

const UUID = /^[0-9a-f-]{36}$/i;
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });

function refresh() {
  revalidatePath("/admin/payments");
  revalidatePath("/app", "layout");
}

/** Found in GCash: turn the plan on (or extend it) and tell the owner. */
export async function confirmPayment(id: string) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(id)) return;
  const { data: pay } = await admin.from("payments").select("business_id, buyer_id, plans(name)").eq("id", id).eq("status", "pending").maybeSingle();
  if (!pay) return refresh();
  const { data, error } = await admin.rpc("apply_payment", { p_payment: id, p_reviewer: user.id });
  if (error) {
    console.error("[billing] confirm failed:", error.message);
    return refresh();
  }
  const end = (Array.isArray(data) ? data[0] : data)?.period_end as string | undefined;
  const planName = (pay.plans as unknown as { name: string } | null)?.name ?? "Your plan";
  const lines: Array<[string, string]> = [
    ["Plan", planName],
    ["Paid until", end ? dateFmt.format(new Date(end)) : "—"],
  ];
  const origin = await getOrigin();
  if (pay.business_id) await emailOwners(admin, pay.business_id as string, `${planName} is on`, lines, { label: "Open ProPilot", url: `${origin}/app/billing` });
  else if (pay.buyer_id) await emailUser(admin, pay.buyer_id as string, `${planName} is on`, lines, { label: "Open ProPilot", url: `${origin}/buyer/plan` });
  refresh();
}

/** Not found in GCash: tell the owner so they can check the reference and try again. */
export async function rejectPayment(id: string, form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(id)) return;
  const reason = str(form, "reason").trim().slice(0, 300) || null;
  const { data } = await admin
    .from("payments")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString(), reject_reason: reason })
    .eq("id", id)
    .eq("status", "pending")
    .select("business_id, buyer_id, reference");
  const row = data?.[0];
  if (row) {
    const lines: Array<[string, string]> = [
      ["GCash reference", (row.reference as string) ?? "—"],
      ["Note", reason ?? "Check the reference number on your GCash receipt and send it again."],
    ];
    const origin = await getOrigin();
    if (row.business_id)
      await emailOwners(admin, row.business_id as string, "We couldn't find your GCash payment", lines, { label: "Open Billing", url: `${origin}/app/billing` });
    else if (row.buyer_id)
      await emailUser(admin, row.buyer_id as string, "We couldn't find your GCash payment", lines, { label: "Open My plan", url: `${origin}/buyer/plan` });
  }
  refresh();
}

/** Give a business or a buyer a plan for free (beta testers, partners, refunds). */
export async function grantPlan(form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  // "b:<id>" for a business, "u:<id>" for a buyer.
  const [kind, targetId] = str(form, "target").split(":");
  const months = Number(str(form, "months"));
  if ((kind !== "b" && kind !== "u") || !UUID.test(targetId ?? "") || ![1, 3, 6, 12].includes(months)) return;
  const { data: plan } = await admin.from("plans").select("id").eq("code", str(form, "plan")).eq("is_active", true).maybeSingle();
  if (!plan) return;
  const { data: pay, error } = await admin
    .from("payments")
    .insert({
      ...(kind === "b" ? { business_id: targetId } : { buyer_id: targetId }),
      plan_id: plan.id,
      months,
      amount_minor: 0,
      method: "complimentary",
      submitted_by: user.id,
    })
    .select("id")
    .single();
  if (error || !pay) {
    console.error("[billing] grant failed:", error?.message);
    return refresh();
  }
  const { error: applyError } = await admin.rpc("apply_payment", { p_payment: pay.id, p_reviewer: user.id });
  if (applyError) {
    console.error("[billing] grant apply failed:", applyError.message);
    await admin.from("payments").delete().eq("id", pay.id).eq("status", "pending");
  }
  refresh();
}
