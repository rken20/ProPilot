"use server";

import { revalidatePath } from "next/cache";
import { getOrigin, getProfile, requireUser } from "@/lib/auth";
import { emailSuperAdmins } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { formatPeso } from "@/lib/money";
import { cleanGcashReference, PAID_PLANS } from "@/lib/plan-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PayState } from "@/app/app/billing/actions";

const MONTHS = [1, 3, 6, 12];

/** A buyer reports a GCash payment for their own plan. A super admin checks it before the plan turns on. */
export async function submitBuyerPayment(_prev: PayState, form: FormData): Promise<PayState> {
  const user = await requireUser();
  if (!process.env.GCASH_NUMBER) return { error: "GCash payments aren't set up yet." };
  const planCode = str(form, "plan");
  if (!(PAID_PLANS as readonly string[]).includes(planCode)) return { error: "Pick a plan." };
  const months = Number(str(form, "months"));
  if (!MONTHS.includes(months)) return { error: "Pick how many months." };
  const reference = cleanGcashReference(str(form, "reference"));
  if (!reference) return { error: "The GCash reference number is 13 digits. You'll find it on the receipt in your GCash app." };
  const payerName = str(form, "payerName").trim().slice(0, 120);
  if (!payerName) return { error: "Type the name on the GCash account you paid from, so we can find the payment." };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "payment_submit", p_limit: 5, p_window_seconds: 3600 });
  if (allowed !== true) return { error: "Too many tries. Please wait a while and try again." };

  const admin = createAdminClient();
  if (!admin) return { error: "Payments aren't available right now." };
  const { data: plan } = await admin.from("plans").select("id, name, price_minor").eq("code", planCode).eq("is_active", true).maybeSingle();
  if (!plan) return { error: "That plan isn't available." };
  const amount = (plan.price_minor as number) * months;

  const { error } = await admin.from("payments").insert({
    buyer_id: user.id,
    plan_id: plan.id,
    months,
    amount_minor: amount,
    method: "gcash",
    reference,
    payer_name: payerName,
    submitted_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return error.message.includes("one_pending")
        ? { error: "You already have a payment waiting to be checked. We'll email you once it's confirmed." }
        : { error: "That reference number has already been used. Check the number on your GCash receipt." };
    }
    console.error("[billing] buyer payment insert failed:", error.message);
    return { error: "Couldn't send your payment details. Please try again." };
  }

  const profile = await getProfile();
  await emailSuperAdmins(
    admin,
    `GCash payment to check: buyer ${profile?.full_name || "account"}`,
    [
      ["Buyer", profile?.full_name || "—"],
      ["Plan", `${plan.name}, ${months} month${months === 1 ? "" : "s"}`],
      ["Amount", formatPeso(amount)],
      ["GCash reference", reference],
      ["Paid from", payerName],
    ],
    { label: "Check payments", url: `${await getOrigin()}/admin/payments` },
  );
  revalidatePath("/buyer/plan");
  return { sent: Date.now() };
}
