"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { boostsIncluded, boostTargeting, checkPlan, pinOf, placeQueries, BOOST_LIMITS, type BoostPlace } from "@/lib/boost-rules";
import { adSignIn } from "@/lib/boosts";
import { pageWithToken } from "@/lib/facebook-pages";
import { appSay } from "@/lib/lang-server";
import { metaConfig } from "@/lib/meta";
import { adAccounts, BoostError, createBoost, findCity, needsReconnect, pauseCampaign, videoDetails } from "@/lib/meta-ads";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type BoostState = { error?: string; started?: number };

const UUID = /^[0-9a-f-]{36}$/i;

/** Only the owner spends the business's ad money, and only on Pro or Agency. */
async function owner() {
  const biz = await requireBusiness();
  if (!can(biz.role, "ads.spend")) return null;
  const plan = await businessPlan(biz.businessId);
  if (!boostsIncluded(plan.code)) return null;
  return biz;
}

/** Choose which of the person's ad accounts pays for boosts. Only active PHP accounts they can use. */
export async function chooseAdAccount(postId: string, form: FormData) {
  const biz = await owner();
  const back = `/app/marketing/boost/${UUID.test(postId) ? postId : ""}`;
  if (!biz) redirect(back);
  const admin = createAdminClient();
  const cfg = metaConfig();
  const signIn = admin ? await adSignIn(admin, biz.businessId) : null;
  const id = String(form.get("account") ?? "");
  if (!admin || !cfg || !signIn || signIn.expired || !/^\d{1,30}$/.test(id)) redirect(back);
  const accounts = await adAccounts(fetch, cfg, signIn.token).catch(() => []);
  const chosen = accounts.find((a) => a.id === id && a.active && a.currency === "PHP");
  if (chosen) await admin.from("meta_ad_connections").update({ ad_account_id: chosen.id, ad_account_name: chosen.name, updated_at: new Date().toISOString() }).eq("business_id", biz.businessId);
  revalidatePath(back);
  redirect(back);
}

/** Start a boost the owner approved: create it on Meta, paused, then switch it on. */
export async function startBoost(postId: string, _prev: BoostState, form: FormData): Promise<BoostState> {
  const say = await appSay();
  const biz = await owner();
  const user = await requireUser();
  if (!biz) return { error: say("Only the business owner can boost, on Pro or Agency.", "Ang business owner lang ang pwedeng mag-boost, sa Pro o Agency.") };
  if (!UUID.test(postId)) return { error: say("That post wasn't found.", "Hindi nahanap ang post na iyan.") };
  if (form.get("approve") !== "yes")
    return { error: say("Tick the box to approve the spending first.", "I-tick muna ang box para aprubahan ang gastos.") };
  const plan = checkPlan(form.get("daily"), form.get("days"));
  if (!plan.ok) return { error: plan.error };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "boost_start", p_limit: 5, p_window_seconds: 3600 });
  if (allowed !== true) return { error: say("Too many boosts started in the last hour. Please try again later.", "Masyadong maraming boost nitong huling oras. Paki-try ulit mamaya.") };

  const admin = createAdminClient();
  const cfg = metaConfig();
  if (!admin || !cfg) return { error: say("Boosting isn't available right now.", "Hindi available ang pag-boost ngayon.") };
  const signIn = await adSignIn(admin, biz.businessId);
  if (!signIn || signIn.expired)
    return { error: say("Connect Facebook again in Connections and allow the ad permissions first.", "I-connect ulit ang Facebook sa Connections at payagan ang ad permissions.") };
  if (!signIn.adAccountId) return { error: say("Choose the ad account that pays for boosts first.", "Pumili muna ng ad account na magbabayad sa boosts.") };

  const { data: post } = await admin
    .from("facebook_posts")
    .select("id, business_id, kind, status, page_id, fb_video_id, property_id, properties(name, location, map_query)")
    .eq("id", postId)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!post || post.kind !== "video" || post.status !== "published" || !post.fb_video_id)
    return { error: say("Only a video posted from MyHomeSeller can be boosted here.", "Video lang na na-post mula sa MyHomeSeller ang pwedeng i-boost dito.") };
  const listing = post.properties as unknown as { name: string; location: string; map_query: string | null } | null;

  // The Page's own row, for its token: the video belongs to the Page.
  const { data: pageRow } = await admin.from("facebook_pages").select("id").eq("business_id", biz.businessId).eq("page_id", post.page_id as string).maybeSingle();
  const page = pageRow ? await pageWithToken(biz.businessId, pageRow.id as string) : null;
  if (!page) return { error: say("The Page this video is on isn't connected any more. Reconnect it in Connections.", "Hindi na connected ang Page ng video na ito. I-reconnect sa Connections.") };

  // Where: the listing's exact pin, else its town or city as Meta knows it.
  let place: BoostPlace | null = null;
  const pin = pinOf(listing?.map_query);
  if (pin) place = { kind: "pin", ...pin, label: listing?.location ?? "" };
  else if (listing?.location) {
    for (const q of placeQueries(listing.location)) {
      const city = await findCity(fetch, cfg, signIn.token, q).catch(() => null);
      if (city) {
        place = { kind: "city", key: city.key, label: city.name };
        break;
      }
    }
  }
  if (!place)
    return {
      error: say(
        "Facebook couldn't find the listing's town. Add a map pin to the listing, then try again.",
        "Hindi mahanap ng Facebook ang bayan ng listing. Maglagay ng map pin sa listing, tapos subukan ulit.",
      ),
    };

  let video: { picture: string | null; description: string };
  try {
    video = await videoDetails(fetch, cfg, post.fb_video_id as string, page.token);
  } catch {
    return { error: say("Facebook didn't answer about this video. Please try again in a minute.", "Hindi sumagot ang Facebook tungkol sa video. Paki-try ulit pagkalipas ng isang minuto.") };
  }
  if (!video.picture) return { error: say("Facebook is still getting this video ready. Try again in a few minutes.", "Inihahanda pa ng Facebook ang video. Subukan ulit pagkalipas ng ilang minuto.") };

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + plan.days * 86_400_000);
  const areaLabel = `Within ${BOOST_LIMITS.radiusKm} km of ${place.label || "the listing"}`.slice(0, 200);
  // Recorded first, with who approved it, so a boost can never run without a record.
  const { data: row, error } = await admin
    .from("ad_boosts")
    .insert({
      business_id: biz.businessId,
      facebook_post_id: post.id,
      property_id: post.property_id,
      ad_account_id: signIn.adAccountId,
      daily_budget_minor: plan.dailyMinor,
      days: plan.days,
      total_minor: plan.totalMinor,
      radius_km: BOOST_LIMITS.radiusKm,
      area_label: areaLabel,
      status: "creating",
      approved_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    return error?.code === "23505"
      ? { error: say("This video already has a boost running. Stop it before starting another.", "May tumatakbong boost na ang video na ito. Itigil muna bago magsimula ng bago.") }
      : { error: say("Couldn't start the boost. Please try again.", "Hindi nasimulan ang boost. Paki-try ulit.") };
  }

  try {
    const ids = await createBoost(fetch, cfg, signIn.token, {
      accountId: signIn.adAccountId,
      pageId: post.page_id as string,
      videoId: post.fb_video_id as string,
      thumbnailUrl: video.picture,
      message: video.description || listing?.name || "",
      name: `MyHomeSeller boost: ${listing?.name ?? "video"} (${startsAt.toISOString().slice(0, 10)})`.slice(0, 200),
      dailyMinor: plan.dailyMinor,
      startsAt,
      endsAt,
      targeting: boostTargeting(place),
    });
    await admin
      .from("ad_boosts")
      .update({ status: "active", campaign_id: ids.campaignId, adset_id: ids.adsetId, creative_id: ids.creativeId, ad_id: ids.adId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
      .eq("id", row.id);
  } catch (e) {
    const ids = e instanceof BoostError ? e.ids : {};
    const message = e instanceof Error ? e.message : String(e);
    console.error("[boost] create failed:", message);
    await admin
      .from("ad_boosts")
      .update({ status: "failed", error: message.slice(0, 300), campaign_id: ids.campaignId ?? null, adset_id: ids.adsetId ?? null, creative_id: ids.creativeId ?? null, ad_id: ids.adId ?? null })
      .eq("id", row.id);
    revalidatePath(`/app/marketing/boost/${postId}`);
    if (needsReconnect(e)) return { error: say("Facebook access for ads has expired. Connect Facebook again in Connections.", "Nag-expire ang Facebook access para sa ads. I-connect ulit ang Facebook sa Connections.") };
    return {
      error: say(
        `Facebook didn't accept the boost, so nothing was spent. Facebook said: ${message.replace(/^Facebook \d+: /, "")}`,
        `Hindi tinanggap ng Facebook ang boost, kaya walang nagastos. Sabi ng Facebook: ${message.replace(/^Facebook \d+: /, "")}`,
      ),
    };
  }
  revalidatePath(`/app/marketing/boost/${postId}`);
  revalidatePath("/app/marketing/analyst");
  return { started: Date.now() };
}

/** Stop a running boost: it is paused on Meta and spends nothing more. */
export async function stopBoost(boostId: string) {
  const biz = await owner();
  const user = await requireUser();
  if (!biz || !UUID.test(boostId)) redirect("/app/marketing/analyst");
  const admin = createAdminClient();
  const cfg = metaConfig();
  const { data: b } = admin
    ? await admin.from("ad_boosts").select("id, facebook_post_id, campaign_id, status").eq("id", boostId).eq("business_id", biz.businessId).maybeSingle()
    : { data: null };
  const back = b ? `/app/marketing/boost/${b.facebook_post_id}` : "/app/marketing/analyst";
  if (!admin || !cfg || !b || b.status !== "active" || !b.campaign_id) redirect(back);
  const signIn = await adSignIn(admin, biz.businessId);
  let notice = "boost-stopped";
  try {
    if (!signIn || signIn.expired) throw new Error("no sign-in");
    await pauseCampaign(fetch, cfg, signIn.token, b.campaign_id as string);
    await admin.from("ad_boosts").update({ status: "stopped", stopped_by: user.id, stopped_at: new Date().toISOString() }).eq("id", b.id);
  } catch (e) {
    console.error("[boost] stop failed:", e instanceof Error ? e.message : String(e));
    notice = "boost-stop-failed";
  }
  revalidatePath(back);
  redirect(`${back}?notice=${notice}`);
}

