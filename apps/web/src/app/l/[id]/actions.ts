"use server";

import { sayIn, toLang } from "@/lib/lang";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { viewingRequestSchema } from "@propilot/shared";
import { getOrigin } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { notifyNewLead, syncLeadsSheet } from "@/lib/lead-jobs";
import { lookingForNote, parseWants, withNote } from "@/lib/match-alert-rules";
import { matchAlertsOn, saveAlert } from "@/lib/match-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSuperAdmins } from "@/lib/billing-email";
import { ANY_REASON_LABEL, REPORT_REASONS } from "@/lib/seller-trust";
import { siteOrigin } from "@/lib/site";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A key for rate limits that doesn't store the visitor's address. */
async function visitorKey(bucket: string): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "unknown";
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return `${bucket}:${createHash("sha256").update(`${salt}:${ip}`).digest("base64url").slice(0, 32)}`;
}

/**
 * An inquiry from a listing's public page, from someone without an account.
 * It becomes a viewing request (and a lead on the Leads page) for the listing's business.
 */
export async function sendInquiry(propertyId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const data = {
    buyerName: str(form, "buyerName"),
    buyerPhone: str(form, "buyerPhone"),
    buyerEmail: str(form, "buyerEmail"),
    preferredDate: str(form, "preferredDate"),
    budgetNote: str(form, "budgetNote"),
    message: str(form, "message"),
    // Optional: what they're looking for, and whether to email them matches.
    wantType: form.getAll("wantType").filter((v): v is string => typeof v === "string").join(","),
    wantBudget: str(form, "wantBudget"),
    wantAreas: str(form, "wantAreas"),
    wantTimeline: str(form, "wantTimeline"),
    wantFinancing: str(form, "wantFinancing"),
    alertConsent: str(form, "alertConsent") ? "on" : "",
  };
  // The page says which language it is in; it only chooses the wording of the answer.
  const say = sayIn(toLang(str(form, "lang")));
  // A field people can't see: only bots fill it in. Pretend it worked.
  if (str(form, "website")) return { ok: true, message: say("Sent. The agent will contact you soon.", "Na-send na. Kokontakin ka ng agent soon.") };

  const parsed = viewingRequestSchema.safeParse({
    propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone,
    preferredDate: data.preferredDate || undefined,
    budgetNote: data.budgetNote || undefined,
    message: data.message || undefined,
  });
  const email = data.buyerEmail.trim().toLowerCase();
  const alertsOn = matchAlertsOn();
  const wanted = parseWants({
    types: data.wantType ? data.wantType.split(",") : [],
    budget: data.wantBudget,
    areas: data.wantAreas,
    timeline: data.wantTimeline,
    financing: data.wantFinancing,
    consent: alertsOn && data.alertConsent === "on",
    email,
  });
  if (!parsed.success || "fieldErrors" in wanted || (email && (!EMAIL.test(email) || email.length > 254))) {
    const fieldErrors = { ...("fieldErrors" in wanted ? wanted.fieldErrors : {}), ...(parsed.success ? {} : fieldErrorsFrom(parsed.error, say)) };
    if (email && (!EMAIL.test(email) || email.length > 254)) fieldErrors.buyerEmail = say("Enter an email like name@example.com, or leave it blank", "Maglagay ng email gaya ng name@example.com, o iwanang blangko");
    return { fieldErrors, data };
  }
  const wants = wanted.wants;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (parsed.data.preferredDate && parsed.data.preferredDate < today) {
    return { fieldErrors: { preferredDate: say("Pick today or a later date", "Pumili ng araw ngayon o mas huli pa") }, data };
  }

  const admin = createAdminClient();
  if (!admin) return { error: say("Inquiries aren't available right now. Please try again later.", "Hindi available ang inquiries ngayon. Paki-try ulit mamaya."), data };
  const [hour, day] = await Promise.all([
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("inquiry-hour"), p_limit: 5, p_window_seconds: 3600 }),
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("inquiry-day"), p_limit: 20, p_window_seconds: 86400 }),
  ]);
  if (hour.data !== true || day.data !== true) {
    return { error: say("You've sent several inquiries already. Please try again later.", "Ilang beses ka nang nag-send ng inquiry. Paki-try ulit mamaya."), data };
  }

  // business_id is filled in by the database from the listing itself.
  const { data: created, error } = await admin
    .from("viewing_requests")
    .insert({
      business_id: "00000000-0000-0000-0000-000000000000",
      property_id: propertyId,
      buyer_id: null,
      buyer_name: parsed.data.buyerName,
      buyer_phone: parsed.data.buyerPhone,
      buyer_email: email || null,
      preferred_date: parsed.data.preferredDate ?? null,
      budget_note: parsed.data.budgetNote ?? null,
      // What they said they're looking for goes to the seller with the inquiry.
      message: withNote(parsed.data.message, lookingForNote(wants)) ?? null,
    })
    .select("id, business_id")
    .single();
  if (error || !created) {
    return {
      error:
        error && /not available/.test(error.message)
          ? say("This listing isn't taking inquiries anymore.", "Hindi na tumatanggap ng inquiry ang listing na ito.")
          : error && /already have an open request/.test(error.message)
            ? say("You've already sent an inquiry for this listing. The agent will contact you.", "Nakapag-send ka na ng inquiry para sa listing na ito. Kokontakin ka ng agent.")
            : error && /too many viewing requests/.test(error.message)
              ? say("This listing has had many inquiries today. Please try again tomorrow.", "Maraming inquiry ang listing na ito ngayong araw. Paki-try ulit bukas.")
              : say("Couldn't send your inquiry. Please try again.", "Hindi na-send ang inquiry mo. Paki-try ulit."),
      data,
    };
  }

  const origin = await getOrigin();
  after(async () => {
    await notifyNewLead(created.id as string, origin);
    await syncLeadsSheet(created.business_id as string);
  });
  // Match emails: saved unconfirmed, and used only after they confirm from the email.
  const confirmSent = wants.consent
    ? await saveAlert(admin, origin, { email, name: parsed.data.buyerName, wants, businessId: created.business_id as string, propertyId }, say).catch(() => false)
    : false;
  return {
    ok: true,
    message: confirmSent
      ? say(
          `Sent. The agent will call or text you to confirm. For the match emails, open the email we just sent to ${email} and confirm.`,
          `Na-send na. Tatawagan o ite-text ka ng agent para mag-confirm. Para sa match emails, buksan ang email na kaka-send lang namin sa ${email} at i-confirm.`,
        )
      : say("Sent. The agent will call or text you to confirm.", "Na-send na. Tatawagan o ite-text ka ng agent para mag-confirm."),
  };
}

/**
 * "Report this listing", from anyone on a public page. The report goes to the
 * app admin only. The answer is the same whether or not a new report was
 * filed, so nothing about the listing's reports can be read off it.
 */
export async function reportListing(propertyId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const say = sayIn(toLang(str(form, "lang")));
  const thanks = { ok: true, message: say("Thank you. MyHomeSeller will look into this listing.", "Salamat. Titingnan ng MyHomeSeller ang listing na ito.") };
  if (str(form, "website")) return thanks;

  const data = { reason: str(form, "reason"), details: str(form, "details").trim(), contact: str(form, "contact").trim() };
  const fieldErrors: Record<string, string> = {};
  if (!(REPORT_REASONS as readonly string[]).includes(data.reason)) fieldErrors.reason = say("Choose what's wrong", "Piliin kung ano ang mali");
  if (data.details.length > 1000) fieldErrors.details = say("Keep it under 1,000 characters", "Hanggang 1,000 characters lang");
  else if (data.reason === "other" && data.details.length < 10) fieldErrors.details = say("Tell us what's wrong in a few words", "Sabihin sa ilang salita kung ano ang mali");
  if (data.contact && !(EMAIL.test(data.contact) || /^[+0-9][0-9\s-]{6,28}$/.test(data.contact))) fieldErrors.contact = say("Enter a mobile number or an email, or leave it blank", "Maglagay ng mobile number o email, o iwanang blangko");
  if (data.contact.length > 120) fieldErrors.contact = say("That's too long", "Masyadong mahaba");
  if (!/^[0-9a-f-]{36}$/i.test(propertyId) || Object.keys(fieldErrors).length) return { fieldErrors, data };

  const admin = createAdminClient();
  if (!admin) return { error: say("Reports aren't available right now. Please try again later.", "Hindi available ang reports ngayon. Paki-try ulit mamaya."), data };
  const [hour, day] = await Promise.all([
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("report-hour"), p_limit: 3, p_window_seconds: 3600 }),
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("report-day"), p_limit: 6, p_window_seconds: 86400 }),
  ]);
  if (hour.data !== true || day.data !== true) return { error: say("You've sent several reports already. Please try again later.", "Ilang beses ka nang nag-report. Paki-try ulit mamaya."), data };

  const { data: id, error } = await admin.rpc("report_listing", { p_property: propertyId, p_source: "visitor", p_reason: data.reason, p_details: data.details || null, p_contact: data.contact || null });
  if (error) {
    if (/not available/.test(error.message)) return { error: say("This listing isn't public anymore.", "Hindi na public ang listing na ito."), data };
    console.error("[report] not filed:", error.message);
    return { error: say("Couldn't send your report. Please try again.", "Hindi na-send ang report mo. Paki-try ulit."), data };
  }
  if (id) {
    // The reporter's contact stays out of the email: it's in the Reports screen only.
    after(() =>
      emailSuperAdmins(
        admin,
        "A listing was reported",
        [
          ["Why", ANY_REASON_LABEL[data.reason] ?? data.reason],
          ["What they said", data.details || "(nothing more)"],
        ],
        { label: "Open Reports", url: `${siteOrigin() ?? "https://myhomeseller.ai"}/admin/reports` },
      ),
    );
  }
  return thanks;
}
