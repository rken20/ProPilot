import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { PageHeader, buttonClass } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";
import { requireBusiness } from "@/lib/auth";
import { manilaMonthStart } from "@/lib/matching";
import { mediaUrl } from "@/lib/media";
import { businessPlan } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { AD_COLUMNS, adListing } from "@/lib/video-ad/listing";
import { MAX_PHOTOS, type AdLanguage } from "@/lib/video-ad/spec";
import { startVideoAd, suggestAd } from "./actions";
import { VideoMaker, type VideoItem } from "./video-maker";

// The AI's suggestion for an ad takes a few seconds.
export const maxDuration = 30;

export default async function VideoAdPage({ searchParams }: PageProps<"/app/video">) {
  const sp = await searchParams;
  const biz = await requireBusiness();
  if (!can(biz.role, "content.create") && !can(biz.role, "property.update")) redirect("/app");
  const plan = await businessPlan(biz.businessId);

  const header = (
    <PageHeader
      title="Video Ad Maker"
      description="Turn a listing's photos into a short video ad for Facebook, TikTok and Reels. The AI picks a template and writes the text; you can change both."
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
              Pro makes 10 video ads a month and Agency 30. Each one is built from your own photos, in four templates and three shapes (vertical, square and wide),
              with the price, location and your business name. The property is shown exactly as it is.
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
  const [{ data: rows }, { count: used }, { data: settings }] = await Promise.all([
    supabase.from("properties").select(AD_COLUMNS).eq("business_id", biz.businessId).in("status", ["available", "reserved"]).order("updated_at", { ascending: false }).limit(60),
    supabase.from("video_ads").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).gte("created_at", manilaMonthStart()),
    supabase.from("agent_settings").select("chat_language").eq("business_id", biz.businessId).maybeSingle(),
  ]);
  const ids = (rows ?? []).map((r) => r.id as string);
  const { data: media } = ids.length
    ? await supabase.from("property_media").select("property_id, storage_path").in("property_id", ids).eq("kind", "photo").order("sort_order").order("created_at")
    : { data: [] };
  const photos = new Map<string, string[]>();
  for (const m of media ?? []) {
    const url = mediaUrl(m.storage_path as string);
    const list = photos.get(m.property_id as string) ?? [];
    if (url && list.length < MAX_PHOTOS) photos.set(m.property_id as string, [...list, url]);
  }
  const items: VideoItem[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    listing: adListing(r as Parameters<typeof adListing>[0], biz.businessName),
    photos: photos.get(r.id as string) ?? [],
  }));
  const wanted = typeof sp.property === "string" ? items.find((i) => i.id === sp.property)?.id : undefined;
  const language: AdLanguage = settings?.chat_language === "english" ? "english" : "taglish";

  return (
    <>
      {header}
      {items.length ? (
        <VideoMaker items={items} initialId={wanted ?? items.find((i) => i.photos.length)?.id ?? items[0]!.id} used={used ?? 0} limit={plan.videoAds} language={language} suggest={suggestAd} begin={startVideoAd} />
      ) : (
        <div className="grid min-h-72 place-items-center rounded-[1.5rem] border-2 border-dashed border-grape-100 p-8 text-center">
          <div>
            <Icon3d name="houses" size={72} className="mx-auto" />
            <p className="mt-3 text-lg font-bold">Add a property first</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">A video ad is made from a listing&apos;s photos and details.</p>
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
