"use server";

import { appSay } from "@/lib/lang-server";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { pageWithToken, RECONNECT_MESSAGE } from "@/lib/facebook-pages";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { GraphError, canPublish, metaConfig, publishVideo } from "@/lib/meta";
import { businessPlan } from "@/lib/plan";
import { siteOrigin } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { videoCaption } from "@/lib/video-ad/caption";
import { AD_COLUMNS, adListing } from "@/lib/video-ad/listing";
import { planVideoAd, type AdPlan, type PlanAsk } from "@/lib/video-ad/plan";
import { VIDEO_BUCKET, VIDEO_EXTS, videoUploadPath, type VideoExt } from "@/lib/video-ad/uploads";
import { MAX_PHOTOS, SHAPE_IDS, TEMPLATE_IDS, cleanText, type AdLanguage, type AdText, type ShapeId, type TemplateId } from "@/lib/video-ad/spec";
import { mediaUrl } from "@/lib/media";
import type { Say } from "@/lib/lang";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notIncluded = (say: Say) =>
  say("The Video Ad Maker is part of the Pro and Agency plans. An owner can upgrade in Billing.", "Kasama ang Video Ad Maker sa Pro at Agency plans. Pwedeng mag-upgrade ang owner sa Billing.");
const mayMake = (role: Parameters<typeof can>[0]) => can(role, "content.create") || can(role, "property.update");

/** The listing, its photos (small versions, in the ad's order) and the business's ad language, as the signed-in teammate may see them. */
async function load(propertyId: string, businessId: string, businessName: string) {
  const supabase = await createClient();
  const [{ data: row }, { data: media }, { data: settings }] = await Promise.all([
    supabase.from("properties").select(AD_COLUMNS).eq("id", propertyId).eq("business_id", businessId).in("status", ["available", "reserved"]).maybeSingle(),
    supabase.from("property_media").select("storage_path, thumb_path").eq("property_id", propertyId).eq("business_id", businessId).eq("kind", "photo").order("sort_order").order("created_at").limit(MAX_PHOTOS),
    supabase.from("agent_settings").select("chat_language").eq("business_id", businessId).maybeSingle(),
  ]);
  const language: AdLanguage = settings?.chat_language === "english" ? "english" : "taglish";
  const photos = (media ?? []).map((m) => mediaUrl((m.thumb_path ?? m.storage_path) as string)).filter((u): u is string => Boolean(u));
  return { supabase, listing: row ? adListing(row as Parameters<typeof adListing>[0], businessName) : null, photos, language };
}

/**
 * The AI's video ad for a listing: a template, the music, the words, and which
 * photos go where. `ask.template` is the look the owner picked, if they picked
 * one; `ask.take` is how many versions they've already seen and passed on.
 * Nothing is saved or counted.
 */
export async function suggestAd(propertyId: string, ask?: PlanAsk): Promise<{ plan?: AdPlan; error?: string }> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!mayMake(biz.role) || !UUID.test(propertyId)) return { error: say("Your role can't make video ads.", "Hindi pwedeng gumawa ng video ads ang role mo.") };
  const plan = await businessPlan(biz.businessId);
  if (plan.videoAds === 0) return { error: notIncluded(say) };
  const { supabase, listing, photos, language } = await load(propertyId, biz.businessId, biz.businessName);
  if (!listing) return { error: "Listing not found." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "video_plan", p_limit: 40, p_window_seconds: 3600 });
  // Without the AI (no key, or too many requests this hour) the plan comes from the listing's own facts.
  // Looking at the photos takes a little longer than text alone; the page allows 30 seconds in all.
  const client = apiKey && allowed === true ? new Anthropic({ apiKey, timeout: 13_000, maxRetries: 0 }) : null;
  // The page sends these, so they are checked like any other input.
  const template = TEMPLATE_IDS.find((t) => t === ask?.template);
  const take = Number.isInteger(ask?.take) && ask!.take! > 0 ? Math.min(ask!.take!, 50) : 0;
  return { plan: await planVideoAd(client, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, listing, photos, language, { template, take }) };
}

/**
 * Take one video ad from the month's allowance, just before the browser makes
 * the file. The video itself never comes here: it is made and kept on the
 * owner's device.
 */
export async function startVideoAd(propertyId: string, template: TemplateId, shape: ShapeId, text: AdText): Promise<{ ok?: true; id?: string; left?: number | null; error?: string }> {
  const say = await appSay();
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!mayMake(biz.role)) return { error: say("Your role can't make video ads.", "Hindi pwedeng gumawa ng video ads ang role mo.") };
  if (!UUID.test(propertyId) || !TEMPLATE_IDS.includes(template) || !SHAPE_IDS.includes(shape)) return { error: say("Something in this ad isn't valid. Reload the page and try again.", "May hindi valid sa ad na ito. I-reload ang page at subukan ulit.") };
  const plan = await businessPlan(biz.businessId);
  if (plan.videoAds === 0) return { error: notIncluded(say) };
  const clean = cleanText({ hook: String(text?.hook ?? ""), lines: Array.isArray(text?.lines) ? text.lines.map(String) : [], cta: String(text?.cta ?? "") });
  if (clean.hook.length < 3) return { error: say("This ad has no headline. Ask for another version and try again.", "Walang headline ang ad na ito. Humingi ng ibang version at subukan ulit.") };

  const admin = createAdminClient();
  if (!admin) return { error: say("The Video Ad Maker isn't available right now.", "Hindi available ang Video Ad Maker ngayon.") };
  const { data: id, error } = await admin.rpc("video_ad_start", {
    p_business: biz.businessId,
    p_user: user.id,
    p_limit: plan.videoAds,
    p_property: propertyId,
    p_template: template,
    p_shape: shape,
    p_text: clean,
  });
  if (error) return { error: say("Couldn't start the video. Please try again.", "Hindi nasimulan ang video. Paki-try ulit.") };
  if (!id) return { error: say(`You've made this month's ${plan.videoAds} video ads on ${plan.name}. They renew on the 1st.`, `Nagawa mo na ang ${plan.videoAds} video ads ngayong buwan sa ${plan.name}. Magre-renew sa a-uno.`) };

  let left: number | null = null;
  if (plan.videoAds !== null) {
    const { manilaMonthStart } = await import("@/lib/matching");
    const { count } = await admin.from("video_ads").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart());
    left = Math.max(0, plan.videoAds - (count ?? 0));
  }
  revalidatePath("/app/video");
  return { ok: true, id: id as string, left };
}

const cantPost = (say: Say) => say("Your role can't post to Facebook.", "Hindi pwedeng mag-post sa Facebook ang role mo.");
const notAvailable = (say: Say) => say("Posting to Facebook isn't available right now.", "Hindi available ang pag-post sa Facebook ngayon.");

/** The video ad as it was recorded when it was made, if it is this business's. */
async function recordedAd(videoAdId: string, businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("video_ads").select("id, property_id, ad_text").eq("id", videoAdId).eq("business_id", businessId).maybeSingle();
  return data as { id: string; property_id: string | null; ad_text: Partial<AdText> | null } | null;
}

/**
 * Step one of posting a video ad to a Facebook Page: a one-time link the
 * browser uploads the finished file through. The file is too large to pass
 * through this server, and nothing is uploaded unless the owner asks to post.
 */
export async function prepareVideoPost(videoAdId: string, ext: string): Promise<{ bucket?: string; path?: string; token?: string; error?: string }> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!can(biz.role, "content.publish")) return { error: cantPost(say) };
  if (!UUID.test(videoAdId) || !VIDEO_EXTS.includes(ext as VideoExt)) return { error: notAvailable(say) };
  const admin = createAdminClient();
  if (!admin || !(await recordedAd(videoAdId, biz.businessId))) return { error: notAvailable(say) };
  const { data, error } = await admin.storage.from(VIDEO_BUCKET).createSignedUploadUrl(videoUploadPath(biz.businessId, videoAdId, ext as VideoExt), { upsert: true });
  if (error || !data) return { error: notAvailable(say) };
  return { bucket: VIDEO_BUCKET, path: data.path, token: data.token };
}

/**
 * Step two: post the uploaded video to one of the business's connected Pages,
 * with a caption made from the ad's own words and the listing's own facts.
 * Pressing Post is the owner's approval; the caption they were shown is built
 * here again from the same record, never taken from the browser.
 */
export async function postVideoAd(videoAdId: string, ext: string, pageRowId: string): Promise<{ postedTo?: string; link?: string; error?: string }> {
  const say = await appSay();
  const [biz, user] = await Promise.all([requireBusiness(), requireUser()]);
  if (!can(biz.role, "content.publish")) return { error: cantPost(say) };
  const cfg = metaConfig();
  const admin = createAdminClient();
  if (!cfg || !admin || !UUID.test(videoAdId) || !VIDEO_EXTS.includes(ext as VideoExt)) return { error: notAvailable(say) };
  const ad = await recordedAd(videoAdId, biz.businessId);
  if (!ad?.property_id) return { error: notAvailable(say) };

  const page = await pageWithToken(biz.businessId, pageRowId);
  if (!page) return { error: say("Pick a connected Page.", "Pumili ng naka-connect na Page.") };
  if (!canPublish(page.tasks)) return { error: say(`You need to be an admin or editor of ${page.name} on Facebook to post there.`, `Kailangan admin o editor ka ng ${page.name} sa Facebook para makapag-post doon.`) };

  // Posting the same video to the same Page twice is almost always a second press.
  const { data: earlier } = await admin.from("facebook_posts").select("permalink_url").eq("video_ad_id", videoAdId).eq("page_id", page.pageId).eq("status", "published").limit(1).maybeSingle();
  if (earlier) return { postedTo: page.name, link: (earlier.permalink_url as string | null) ?? undefined };

  const { supabase, listing } = await load(ad.property_id, biz.businessId, biz.businessName);
  if (!listing) return { error: say("This listing is no longer available or reserved, so its ad can't be posted.", "Hindi na available o reserved ang listing na ito, kaya hindi na ma-post ang ad nito.") };
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "fb_publish", p_limit: 10, p_window_seconds: 3600 });
  if (allowed !== true) return { error: say("You've posted a lot in the last hour. Please try again later.", "Marami ka nang na-post nitong huling oras. Paki-try ulit mamaya.") };

  const path = videoUploadPath(biz.businessId, videoAdId, ext as VideoExt);
  // Facebook fetches the file itself, so it gets a link that works for an hour and for this file only.
  const { data: file } = await admin.storage.from(VIDEO_BUCKET).createSignedUrl(path, 3600);
  if (!file?.signedUrl) return { error: say("The video didn't finish uploading. Please try again.", "Hindi natapos ang upload ng video. Paki-try ulit.") };
  const { data: property } = await supabase.from("properties").select("is_public").eq("id", ad.property_id).maybeSingle();
  const origin = siteOrigin();
  const link = property?.is_public && origin ? `${origin}/l/${ad.property_id}` : null;
  const text = cleanText({ hook: String(ad.ad_text?.hook ?? ""), lines: Array.isArray(ad.ad_text?.lines) ? ad.ad_text.lines.map(String) : [], cta: String(ad.ad_text?.cta ?? "") });

  const log = { business_id: biz.businessId, property_id: ad.property_id, page_id: page.pageId, page_name: page.name, created_by: user.id, kind: "video", video_ad_id: videoAdId };
  try {
    const res = await publishVideo(fetch, cfg, page.pageId, page.token, file.signedUrl, videoCaption(text, listing, link), listing.name);
    await admin.from("facebook_posts").insert({ ...log, status: "published", fb_video_id: /^[0-9]{5,30}$/.test(res.videoId) ? res.videoId : null, fb_post_id: res.postId ?? null, permalink_url: res.permalink ?? null });
    revalidatePath(`/app/properties/${ad.property_id}`);
    return { postedTo: page.name, link: res.permalink };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("facebook_posts").insert({ ...log, status: "failed", error: message.slice(0, 300) });
    if (e instanceof GraphError && e.tokenInvalid) return { error: RECONNECT_MESSAGE };
    console.error("[meta] video post failed:", message);
    return { error: say("Facebook didn't accept the video. Please try again in a minute.", "Hindi tinanggap ng Facebook ang video. Paki-try ulit pagkalipas ng isang minuto.") };
  }
}
