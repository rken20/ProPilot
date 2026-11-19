"use server";

import { revalidatePath } from "next/cache";
import { getOrigin } from "@/lib/auth";
import { emailOwners } from "@/lib/billing-email";
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
  const { data: pay } = await admin.from("payments").select("business_id, plans(name)").eq("id", id).eq("status", "pending").maybeSingle();
  if (!pay) return refresh();
  const { data, error } = await admin.rpc("apply_payment", { p_payment: id, p_reviewer: user.id });
  if (error) {
    console.error("[billing] confirm failed:", error.message);
    return refresh();
  }
  const end = (Array.isArray(data) ? data[0] : data)?.period_end as string | undefined;
  const planName = (pay.plans as unknown as { name: string } | null)?.name ?? "Your plan";
  await emailOwners(
    admin,
    pay.business_id as string,
    `${planName} is on`,
    [
      ["Plan", planName],
      ["Paid until", end ? dateFmt.format(new Date(end)) : "—"],
    ],
    { label: "Open ProPilot", url: `${await getOrigin()}/app/billing` },
  );
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
    .select("business_id, reference");
  const row = data?.[0];
  if (row) {
    await emailOwners(
      admin,
      row.business_id as string,
      "We couldn't find your GCash payment",
      [
        ["GCash reference", (row.reference as string) ?? "—"],
        ["Note", reason ?? "Check the reference number on your GCash receipt and send it again."],
      ],
      { label: "Open Billing", url: `${await getOrigin()}/app/billing` },
    );
  }
  refresh();
}

/** Give a business a plan for free (beta testers, partners, refunds). */
export async function grantPlan(form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  const businessId = str(form, "businessId");
  const months = Number(str(form, "months"));
  if (!UUID.test(businessId) || ![1, 3, 6, 12].includes(months)) return;
  const { data: plan } = await admin.from("plans").select("id").eq("code", str(form, "plan")).eq("is_active", true).maybeSingle();
  if (!plan) return;
  const { data: pay, error } = await admin
    .from("payments")
    .insert({ business_id: businessId, plan_id: plan.id, months, amount_minor: 0, method: "complimentary", submitted_by: user.id })
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
