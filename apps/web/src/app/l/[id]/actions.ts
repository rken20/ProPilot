"use server";

import { createHash } from "node:crypto";
import { after } from "next/server";
import { headers } from "next/headers";
import { viewingRequestSchema } from "@propilot/shared";
import { getOrigin } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { notifyNewLead, syncLeadsSheet } from "@/lib/lead-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * It becomes a viewing request (and a lead in the Pipeline) for the listing's business.
 */
export async function sendInquiry(propertyId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const data = {
    buyerName: str(form, "buyerName"),
    buyerPhone: str(form, "buyerPhone"),
    buyerEmail: str(form, "buyerEmail"),
    preferredDate: str(form, "preferredDate"),
    budgetNote: str(form, "budgetNote"),
    message: str(form, "message"),
  };
  // A field people can't see: only bots fill it in. Pretend it worked.
  if (str(form, "website")) return { ok: true, message: "Sent. The agent will contact you soon." };

  const parsed = viewingRequestSchema.safeParse({
    propertyId,
    buyerName: data.buyerName,
    buyerPhone: data.buyerPhone,
    preferredDate: data.preferredDate || undefined,
    budgetNote: data.budgetNote || undefined,
    message: data.message || undefined,
  });
  const email = data.buyerEmail.trim().toLowerCase();
  if (!parsed.success || (email && (!EMAIL.test(email) || email.length > 254))) {
    const fieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error);
    if (email && (!EMAIL.test(email) || email.length > 254)) fieldErrors.buyerEmail = "Enter an email like name@example.com, or leave it blank";
    return { fieldErrors, data };
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (parsed.data.preferredDate && parsed.data.preferredDate < today) {
    return { fieldErrors: { preferredDate: "Pick today or a later date" }, data };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Inquiries aren't available right now. Please try again later.", data };
  const [hour, day] = await Promise.all([
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("inquiry-hour"), p_limit: 5, p_window_seconds: 3600 }),
    admin.rpc("consume_anon_rate_limit", { p_key: await visitorKey("inquiry-day"), p_limit: 20, p_window_seconds: 86400 }),
  ]);
  if (hour.data !== true || day.data !== true) {
    return { error: "You've sent several inquiries already. Please try again later.", data };
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
      message: parsed.data.message ?? null,
    })
    .select("id, business_id")
    .single();
  if (error || !created) {
    return {
      error:
        error && /not available/.test(error.message)
          ? "This listing isn't taking inquiries anymore."
          : error && /already have an open request/.test(error.message)
            ? "You've already sent an inquiry for this listing. The agent will contact you."
            : error && /too many viewing requests/.test(error.message)
              ? "This listing has had many inquiries today. Please try again tomorrow."
              : "Couldn't send your inquiry. Please try again.",
      data,
    };
  }

  const origin = await getOrigin();
  after(async () => {
    await notifyNewLead(created.id as string, origin);
    await syncLeadsSheet(created.business_id as string);
  });
  return { ok: true, message: "Sent. The agent will call or text you to confirm." };
}
