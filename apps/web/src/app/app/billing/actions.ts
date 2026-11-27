"use server";

import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { getOrigin, requireBusiness, requireUser } from "@/lib/auth";
import { emailSuperAdmins } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { formatPeso } from "@/lib/money";
import { cleanGcashReference, MAX_MONTHS, PAID_PLANS, validMonths } from "@/lib/plan-rules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { businessPlan } from "@/lib/plan";
import { creditsLabel } from "@/lib/credit-rules";

export type PayState = { error?: string; sent?: number };

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
  if (!validMonths(months)) return { error: say(`Pick how many months, from 1 to ${MAX_MONTHS}.`, `Piliin kung ilang months, mula 1 hanggang ${MAX_MONTHS}.`) };
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

/** The owner reports a GCash payment for an AI credit pack. A super admin checks it before the credits are added. */
export async function submitCreditPayment(
  _prev: PayState,
  form: FormData,
): Promise<PayState> {
  const biz = await requireBusiness();
  const say = await appSay();
  const user = await requireUser();
  if (!can(biz.role, "billing.manage"))
    return {
      error: say(
        "Only the business owner can buy AI credits.",
        "Business owner lang ang pwedeng bumili ng AI credits.",
      ),
    };
  if (!process.env.GCASH_NUMBER)
    return {
      error: say(
        "GCash payments aren't set up yet.",
        "Hindi pa naka-set up ang GCash payments.",
      ),
    };

  const packCode = str(form, "pack");
  const reference = cleanGcashReference(str(form, "reference"));
  if (!reference)
    return {
      error: say(
        "The GCash reference number is 13 digits. You'll find it on the receipt in your GCash app.",
        "13 digits ang GCash reference number. Makikita mo ito sa receipt sa GCash app mo.",
      ),
    };
  const payerName = str(form, "payerName").trim().slice(0, 120);
  if (!payerName)
    return {
      error: say(
        "Type the name on the GCash account you paid from, so we can find the payment.",
        "I-type ang pangalan sa GCash account na ginamit mong pambayad, para mahanap namin ang payment.",
      ),
    };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", {
    p_bucket: "payment_submit",
    p_limit: 5,
    p_window_seconds: 3600,
  });
  if (allowed !== true)
    return {
      error: say(
        "Too many tries. Please wait a while and try again.",
        "Masyadong maraming try. Maghintay sandali at subukan ulit.",
      ),
    };

  const admin = createAdminClient();
  if (!admin)
    return {
      error: say(
        "Payments aren't available right now.",
        "Hindi available ang payments ngayon.",
      ),
    };
  // AI credits carry the plan's AI on, so they need a paid plan.
  const plan = await businessPlan(biz.businessId);
  if (!plan.ai)
    return {
      error: say(
        "AI credits are for the paid plans. Choose a plan first.",
        "Para sa paid plans ang AI credits. Pumili muna ng plan.",
      ),
    };
  const { data: pack } = await admin
    .from("credit_packs")
    .select("code, credits, price_minor")
    .eq("code", packCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!pack)
    return { error: say("Pick a credit pack.", "Pumili ng credit pack.") };

  const { error } = await admin.from("payments").insert({
    business_id: biz.businessId,
    pack_code: pack.code,
    months: 1,
    amount_minor: pack.price_minor,
    method: "gcash",
    reference,
    payer_name: payerName,
    submitted_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return error.message.includes("payments_one_pending_pack")
        ? {
            error: say(
              "You already have a credit pack payment waiting to be checked. We'll email you once it's confirmed.",
              "May credit pack payment ka nang naghihintay ma-check. Ie-email ka namin kapag na-confirm na.",
            ),
          }
        : {
            error: say(
              "That reference number has already been used. Check the number on your GCash receipt.",
              "Nagamit na ang reference number na iyan. I-check ang number sa GCash receipt mo.",
            ),
          };
    }
    console.error("[billing] credit payment insert failed:", error.message);
    return {
      error: say(
        "Couldn't send your payment details. Please try again.",
        "Hindi na-send ang payment details mo. Paki-try ulit.",
      ),
    };
  }

  await emailSuperAdmins(
    admin,
    `GCash payment to check: ${biz.businessName}`,
    [
      ["Business", biz.businessName],
      ["For", creditsLabel(Number(pack.credits))],
      ["Amount", formatPeso(Number(pack.price_minor))],
      ["GCash reference", reference],
      ["Paid from", payerName],
    ],
    { label: "Check payments", url: `${await getOrigin()}/admin/payments` },
  );
  revalidatePath("/app/billing");
  return { sent: Date.now() };
}
