"use server";

import { revalidatePath } from "next/cache";
import { getOrigin } from "@/lib/auth";
import { emailOwners } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { GRANT_MONTHS, MAX_GRANT_EMAILS, parseEmails, type GrantResult } from "@/lib/plan-grants";
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
  const lines: Array<[string, string]> = [
    ["Plan", planName],
    ["Paid until", end ? dateFmt.format(new Date(end)) : "—"],
  ];
  const origin = await getOrigin();
  if (pay.business_id) await emailOwners(admin, pay.business_id as string, `${planName} is on`, lines, { label: "Open MyHomeSeller", url: `${origin}/app/billing` });
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
    const lines: Array<[string, string]> = [
      ["GCash reference", (row.reference as string) ?? "—"],
      ["Note", reason ?? "Check the reference number on your GCash receipt and send it again."],
    ];
    const origin = await getOrigin();
    if (row.business_id)
      await emailOwners(admin, row.business_id as string, "We couldn't find your GCash payment", lines, { label: "Open Billing", url: `${origin}/app/billing` });
  }
  refresh();
}

/** Give a business a plan for free (beta testers, partners, refunds). It shows in their payment history as a ₱0 payment. */
export async function grantPlan(form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  // "b:<id>" for a business.
  const [kind, targetId] = str(form, "target").split(":");
  const months = Number(str(form, "months"));
  if (kind !== "b" || !UUID.test(targetId ?? "") || !GRANT_MONTHS.includes(months as (typeof GRANT_MONTHS)[number])) return;
  const { error } = await admin.rpc("grant_plan_to_business", { p_business: targetId, p_plan_code: str(form, "plan"), p_months: months, p_by: user.id });
  if (error) console.error("[billing] grant failed:", error.message);
  refresh();
}

export type GrantByEmailState = { error?: string; plan?: string; results?: GrantResult[]; skipped?: string[] };

/**
 * Give a plan to beta testers by email. For an email that already owns a
 * business the plan is on at once; otherwise it waits and turns on when that
 * person signs up (with a confirmed email) and sets up their business.
 */
export async function grantByEmail(_prev: GrantByEmailState, form: FormData): Promise<GrantByEmailState> {
  const { user, admin } = await requireSuperAdmin();
  const { emails, invalid, tooMany } = parseEmails(str(form, "emails").slice(0, 10_000));
  const months = Number(str(form, "months"));
  const note = str(form, "note").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!emails.length) return { error: invalid.length ? `Not an email address: ${invalid.join(", ")}` : "Type at least one email address." };
  if (tooMany) return { error: `Give at most ${MAX_GRANT_EMAILS} emails at a time.` };
  if (!GRANT_MONTHS.includes(months as (typeof GRANT_MONTHS)[number])) return { error: "Choose how many months." };
  const { data: plan } = await admin.from("plans").select("code, name").eq("code", str(form, "plan")).eq("is_active", true).neq("price_minor", 0).maybeSingle();
  if (!plan) return { error: "Choose a plan." };

  const origin = await getOrigin();
  const results: GrantResult[] = [];
  // One at a time: each is its own small transaction, and a tester list is short.
  for (const email of emails) {
    const { data, error } = await admin.rpc("grant_plan_by_email", { p_email: email, p_plan_code: plan.code, p_months: months, p_note: note || null, p_by: user.id });
    const row = (Array.isArray(data) ? data[0] : data) as { status: GrantResult["status"]; business_id: string | null; business_name: string | null; period_end: string | null } | null;
    if (error || !row) {
      console.error("[billing] grant by email failed:", error?.message ?? "no result");
      results.push({ email, status: "failed" });
      continue;
    }
    const until = row.period_end ? dateFmt.format(new Date(row.period_end)) : null;
    results.push({ email, status: row.status, business: row.business_name, until });
    if (row.status === "applied" && row.business_id) {
      const lines: Array<[string, string]> = [
        ["Plan", plan.name as string],
        ["Free until", until ?? "—"],
      ];
      await emailOwners(admin, row.business_id, `${plan.name} is on`, lines, { label: "Open MyHomeSeller", url: `${origin}/app/billing` });
    }
  }
  refresh();
  return { plan: plan.name as string, results, skipped: invalid };
}

/** Take back a plan that is still waiting for its email to sign up. A plan that is already on is not changed. */
export async function cancelGrant(id: string) {
  const { admin } = await requireSuperAdmin();
  if (!UUID.test(id)) return;
  const { error } = await admin.from("plan_grants").update({ cancelled_at: new Date().toISOString() }).eq("id", id).is("claimed_at", null).is("cancelled_at", null);
  if (error) console.error("[billing] cancel grant failed:", error.message);
  refresh();
}
