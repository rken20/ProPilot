"use server";

import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { getOrigin, requireBusiness, requireUser } from "@/lib/auth";
import { emailSuperAdmins } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { formatPeso } from "@/lib/money";
import { cleanGcashReference, PAID_PLANS } from "@/lib/plan-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PayState = { error?: string; sent?: number };

const MONTHS = [1, 3, 6, 12];

/** The owner reports a GCash payment. A super admin checks it in GCash before the plan turns on. */
export async function submitGcashPayment(_prev: PayState, form: FormData): Promise<PayState> {
  const biz = await requireBusiness();
  const say = await appSay();
  const user = await requireUser();
  if (!can(biz.role, "billing.manage")) return { error: say("Only the business owner can pay for a plan.", "Business owner lang ang pwedeng magbayad ng plan.") };
  if (!process.env.GCASH_NUMBER) return { error: say("GCash payments aren't set up yet.", "Hindi pa naka-set up ang GCash payments.") };

  const planCode = str(form, "plan");
  if (!(PAID_PLANS as readonly string[]).includes(planCode)) return { error: "Pick a plan." };
  const months = Number(str(form, "months"));
  if (!MONTHS.includes(months)) return { error: say("Pick how many months.", "Piliin kung ilang months.") };
  const reference = cleanGcashReference(str(form, "reference"));
  if (!reference) return { error: say("The GCash reference number is 13 digits. You'll find it on the receipt in your GCash app.", "13 digits ang GCash reference number. Makikita mo ito sa receipt sa GCash app mo.") };
  const payerName = str(form, "payerName").trim().slice(0, 120);
  if (!payerName) return { error: say("Type the name on the GCash account you paid from, so we can find the payment.", "I-type ang pangalan sa GCash account na ginamit mong pambayad, para mahanap namin ang payment.") };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "payment_submit", p_limit: 5, p_window_seconds: 3600 });
  if (allowed !== true) return { error: say("Too many tries. Please wait a while and try again.", "Masyadong maraming try. Maghintay sandali at subukan ulit.") };

  const admin = createAdminClient();
  if (!admin) return { error: say("Payments aren't available right now.", "Hindi available ang payments ngayon.") };
  const { data: plan } = await admin.from("plans").select("id, name, price_minor").eq("code", planCode).eq("is_active", true).maybeSingle();
  if (!plan) return { error: say("That plan isn't available.", "Hindi available ang plan na iyan.") };
  const amount = (plan.price_minor as number) * months;

  const { error } = await admin.from("payments").insert({
    business_id: biz.businessId,
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
      return error.message.includes("payments_one_pending")
        ? { error: say("You already have a payment waiting to be checked. We'll email you once it's confirmed.", "May payment ka nang naghihintay ma-check. Ie-email ka namin kapag na-confirm na.") }
        : { error: say("That reference number has already been used. Check the number on your GCash receipt.", "Nagamit na ang reference number na iyan. I-check ang number sa GCash receipt mo.") };
    }
    console.error("[billing] payment insert failed:", error.message);
    return { error: say("Couldn't send your payment details. Please try again.", "Hindi na-send ang payment details mo. Paki-try ulit.") };
  }

  await emailSuperAdmins(
    admin,
    `GCash payment to check: ${biz.businessName}`,
    [
      ["Business", biz.businessName],
      ["Plan", `${plan.name}, ${months} month${months === 1 ? "" : "s"}`],
      ["Amount", formatPeso(amount)],
      ["GCash reference", reference],
      ["Paid from", payerName],
    ],
    { label: "Check payments", url: `${await getOrigin()}/admin/payments` },
  );
  revalidatePath("/app/billing");
  return { sent: Date.now() };
}
