import { appSay } from "@/lib/lang-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { PageHeader, buttonClass } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";
import { requireBusiness } from "@/lib/auth";
import { businessPages } from "@/lib/facebook-pages";
import { manilaMonthStart } from "@/lib/matching";
import { mediaUrl } from "@/lib/media";
import { canPublish } from "@/lib/meta";
import { businessPlan } from "@/lib/plan";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { AD_COLUMNS, adListing } from "@/lib/video-ad/listing";
import { MAX_PHOTOS, type AdLanguage } from "@/lib/video-ad/spec";
import { postVideoAd, prepareVideoPost, startVideoAd, suggestAd } from "./actions";
import { VideoMaker, type VideoItem } from "./video-maker";

// The AI making an ad (it looks at the photos) takes several seconds, and Facebook takes its time fetching a posted video.
export const maxDuration = 60;

export default async function VideoAdPage({ searchParams }: PageProps<"/app/video">) {
  const say = await appSay();
  const sp = await searchParams;
  const biz = await requireBusiness();
  if (!can(biz.role, "content.create") && !can(biz.role, "property.update")) redirect("/app");
  const plan = await businessPlan(biz.businessId);

  const header = (
    <PageHeader
      title="Video Ad Maker"
      description={say("Turn a listing's photos into a short video ad for Facebook, TikTok and Reels. The AI looks at the photos and makes the ad, with the words and the music. You pick the look, then keep it or ask for another version.", "Gawing short video ad ang photos ng listing para sa Facebook, TikTok at Reels. Tinitingnan ng AI ang photos at ginagawa ang ad, kasama ang words at music. Ikaw ang pipili ng look, tapos i-keep mo o humingi ng ibang version.")}
    />
  );

  if (plan.videoAds === 0) {
    return (
      <>
        {header}
        <section className="flex flex-wrap items-center gap-5 rounded-[1.5rem] bg-tile-lavender p-6 sm:p-8">
          <Icon3d name="rocket" size={72} />
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-xl font-extrabold tracking-tight">Part of the Pro and Agency plans</h2>
            <p className="mt-1 max-w-xl text-sm text-ink/80">
              {say(
                "Pro makes 10 video ads a month and Agency 30. Each one is built from your own photos, in six templates and three shapes (vertical, square and wide), with the price, location and your business name. The property is shown exactly as it is.",
                "10 video ads kada buwan sa Pro at 30 sa Agency. Bawat isa, gawa sa sarili mong photos, sa anim na templates at tatlong shapes (vertical, square at wide), kasama ang presyo, location at pangalan ng business mo. Ipinapakita ang property kung ano talaga ito.",
              )}
            </p>
          </div>
          {can(biz.role, "billing.view") ? (
            <Link href="/app/billing" className={buttonClass("primary")}>
              See the plans
            </Link>
          ) : null}
        </section>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: rows }, { count: used }, { data: settings }, pages] = await Promise.all([
    supabase.from("properties").select(`${AD_COLUMNS}, is_public`).eq("business_id", biz.businessId).in("status", ["available", "reserved"]).order("updated_at", { ascending: false }).limit(60),
    supabase.from("video_ads").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart()),
    supabase.from("agent_settings").select("chat_language").eq("business_id", biz.businessId).maybeSingle(),
    businessPages(biz.businessId),
  ]);
  const origin = siteOrigin();
  const ids = (rows ?? []).map((r) => r.id as string);
  const { data: media } = ids.length
    ? await supabase.from("property_media").select("property_id, storage_path, thumb_path").in("property_id", ids).eq("kind", "photo").order("sort_order").order("created_at")
    : { data: [] };
  const photos = new Map<string, Array<{ full: string; thumb: string }>>();
  for (const m of media ?? []) {
    const full = mediaUrl(m.storage_path as string);
    const list = photos.get(m.property_id as string) ?? [];
    if (full && list.length < MAX_PHOTOS) photos.set(m.property_id as string, [...list, { full, thumb: mediaUrl((m.thumb_path ?? m.storage_path) as string) ?? full }]);
  }
  const items: VideoItem[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    listing: adListing(r as Parameters<typeof adListing>[0], biz.businessName),
    photos: (photos.get(r.id as string) ?? []).map((p) => p.full),
    thumbs: (photos.get(r.id as string) ?? []).map((p) => p.thumb),
    // The listing's public page, named in the caption when the ad is posted to Facebook.
    link: r.is_public && origin ? `${origin}/l/${r.id as string}` : null,
  }));
  const wanted = typeof sp.property === "string" ? items.find((i) => i.id === sp.property)?.id : undefined;
  const language: AdLanguage = settings?.chat_language === "english" ? "english" : "taglish";

  return (
    <>
      {header}
      {items.length ? (
        <VideoMaker items={items} initialId={wanted ?? items.find((i) => i.photos.length)?.id ?? items[0]!.id} used={used ?? 0}
          limit={plan.videoAds}
          language={language}
          suggest={suggestAd}
          begin={startVideoAd}
          facebook={{ pages: pages.filter((p) => canPublish(p.tasks)).map((p) => ({ id: p.id, name: p.name })), connected: pages.length > 0, mayPost: can(biz.role, "content.publish"), prepare: prepareVideoPost, post: postVideoAd }}
        />
      ) : (
        <div className="grid min-h-72 place-items-center rounded-[1.5rem] border-2 border-dashed border-grape-100 p-8 text-center">
          <div>
            <Icon3d name="houses" size={72} className="mx-auto" />
            <p className="mt-3 text-lg font-bold">Add a property first</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{say("A video ad is made from a listing's photos and details.", "Gawa ang video ad mula sa photos at details ng listing.")}</p>
            {can(biz.role, "property.create") ? (
              <Link href="/app/properties/new" className={`${buttonClass("primary")} mt-4`}>
                Add a property
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
