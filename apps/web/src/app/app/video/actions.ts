"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AD_COLUMNS, adListing } from "@/lib/video-ad/listing";
import { planVideoAd, type AdPlan } from "@/lib/video-ad/plan";
import { SHAPE_IDS, TEMPLATE_IDS, cleanText, type AdLanguage, type AdText, type ShapeId, type TemplateId } from "@/lib/video-ad/spec";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_INCLUDED = "The Video Ad Maker is part of the Pro and Agency plans. An owner can upgrade in Billing.";
const mayMake = (role: Parameters<typeof can>[0]) => can(role, "content.create") || can(role, "property.update");

/** The listing, its photo count and the business's ad language, as the signed-in teammate may see them. */
async function load(propertyId: string, businessId: string, businessName: string) {
  const supabase = await createClient();
  const [{ data: row }, { count }, { data: settings }] = await Promise.all([
    supabase.from("properties").select(AD_COLUMNS).eq("id", propertyId).eq("business_id", businessId).in("status", ["available", "reserved"]).maybeSingle(),
    supabase.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", propertyId).eq("kind", "photo"),
    supabase.from("agent_settings").select("chat_language").eq("business_id", businessId).maybeSingle(),
  ]);
  const language: AdLanguage = settings?.chat_language === "english" ? "english" : "taglish";
  return { supabase, listing: row ? adListing(row as Parameters<typeof adListing>[0], businessName) : null, photos: count ?? 0, language };
}

/** The AI's suggestion for a listing's video ad: a template and the words. Nothing is saved or counted. */
export async function suggestAd(propertyId: string): Promise<{ plan?: AdPlan; error?: string }> {
  const biz = await requireBusiness();
  if (!mayMake(biz.role) || !UUID.test(propertyId)) return { error: "Your role can't make video ads." };
  const plan = await businessPlan(biz.businessId);
  if (plan.videoAds === 0) return { error: NOT_INCLUDED };
  const { supabase, listing, photos, language } = await load(propertyId, biz.businessId, biz.businessName);
  if (!listing) return { error: "Listing not found." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "video_plan", p_limit: 40, p_window_seconds: 3600 });
  // Without the AI (no key, or too many requests this hour) the plan comes from the listing's own facts.
  const client = apiKey && allowed === true ? new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 }) : null;
  return { plan: await planVideoAd(client, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, listing, photos, language) };
}

/**
 * Take one video ad from the month's allowance, just before the browser makes
 * the file. The video itself never comes here: it is made and kept on the
 * owner's device.
 */
export async function startVideoAd(propertyId: string, template: TemplateId, shape: ShapeId, text: AdText): Promise<{ ok?: true; left?: number | null; error?: string }> {
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!mayMake(biz.role)) return { error: "Your role can't make video ads." };
  if (!UUID.test(propertyId) || !TEMPLATE_IDS.includes(template) || !SHAPE_IDS.includes(shape)) return { error: "Something in this ad isn't valid. Reload the page and try again." };
  const plan = await businessPlan(biz.businessId);
  if (plan.videoAds === 0) return { error: NOT_INCLUDED };
  const clean = cleanText({ hook: String(text?.hook ?? ""), lines: Array.isArray(text?.lines) ? text.lines.map(String) : [], cta: String(text?.cta ?? "") });
  if (clean.hook.length < 3) return { error: "Write a headline for the ad first." };

  const admin = createAdminClient();
  if (!admin) return { error: "The Video Ad Maker isn't available right now." };
  const { data: id, error } = await admin.rpc("video_ad_start", {
    p_business: biz.businessId,
    p_user: user.id,
    p_limit: plan.videoAds,
    p_property: propertyId,
    p_template: template,
    p_shape: shape,
    p_text: clean,
  });
  if (error) return { error: "Couldn't start the video. Please try again." };
  if (!id) return { error: `You've made this month's ${plan.videoAds} video ads on ${plan.name}. They renew on the 1st.` };

  let left: number | null = null;
  if (plan.videoAds !== null) {
    const { manilaMonthStart } = await import("@/lib/matching");
    const { count } = await admin.from("video_ads").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart());
    left = Math.max(0, plan.videoAds - (count ?? 0));
  }
  revalidatePath("/app/video");
  return { ok: true, left };
}
