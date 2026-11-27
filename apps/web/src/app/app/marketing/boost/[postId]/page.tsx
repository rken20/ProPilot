import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { can } from "@propilot/shared";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, buttonClass, EmptyState, Field, PageHeader, Panel, Select } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { boostsIncluded, boostTargeting, costPerChat, pinOf, placeQueries, suggestedPlan, BOOST_LIMITS, type BoostStatus } from "@/lib/boost-rules";
import { adSignIn, refreshBoosts } from "@/lib/boosts";
import { appSay } from "@/lib/lang-server";
import { metaConfig } from "@/lib/meta";
import { adAccounts, deliveryEstimate, findCity } from "@/lib/meta-ads";
import { formatPeso } from "@/lib/money";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { chooseAdAccount, stopBoost } from "../actions";
import { BoostForm } from "./boost-form";

export const metadata = { title: "Boost" };
// Facebook is asked for ad accounts, the audience estimate and results when the page opens.
export const maxDuration = 30;

const STATUS: Record<BoostStatus, { label: string; tone: "neutral" | "brand" | "hot" }> = {
  creating: { label: "Starting", tone: "neutral" },
  active: { label: "Running", tone: "brand" },
  stopped: { label: "Stopped", tone: "neutral" },
  finished: { label: "Finished", tone: "neutral" },
  failed: { label: "Didn't start", tone: "hot" },
};

const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-PH");

/** Boost one video posted from MyHomeSeller, for Messenger chats, with the owner's approval. */
export default async function BoostPage({ params, searchParams }: PageProps<"/app/marketing/boost/[postId]">) {
  const [{ postId }, sp] = await Promise.all([params, searchParams]);
  const biz = await requireBusiness();
  if (!can(biz.role, "analytics.view") && !can(biz.role, "content.publish")) redirect("/app/marketing");
  if (!/^[0-9a-f-]{36}$/i.test(postId)) notFound();
  const [plan, say] = await Promise.all([businessPlan(biz.businessId), appSay()]);
  const canSpend = can(biz.role, "ads.spend");
  const back = (
    <Link href="/app/marketing/analyst" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Analyst
    </Link>
  );
  const header = (
    <PageHeader
      icon3d="rocket"
      tone="peach"
      title="Boost This Video"
      description={say(
        "Show this video to more people nearby, with a Send Message button that opens a chat with your Page. You choose the amount; Facebook charges your own ad account.",
        "Ipakita ang video sa mas maraming tao sa malapit, may Send Message button na magbubukas ng chat sa Page mo. Ikaw ang pipili ng halaga; sisingilin ng Facebook ang sarili mong ad account.",
      )}
    />
  );

  if (!boostsIncluded(plan.code)) {
    return (
      <>
        {back}
        {header}
        <EmptyState
          icon="rocket"
          title={say("Boosting is part of Pro and Agency", "Kasama ang pag-boost sa Pro at Agency")}
          action={
            can(biz.role, "billing.view") ? (
              <Link href="/app/billing" className={buttonClass("primary")}>
                {say("See plans", "Tingnan ang plans")}
              </Link>
            ) : undefined
          }
        >
          {say(
            "On Pro and Agency you can boost your video ads from here, for Messenger chats, and see what each boost spent and brought in.",
            "Sa Pro at Agency, pwede mong i-boost dito ang video ads mo para sa Messenger chats, at makita kung magkano ang nagastos at ilan ang naging chats.",
          )}
        </EmptyState>
      </>
    );
  }

  const admin = createAdminClient();
  if (!admin) notFound();
  const { data: post } = await admin
    .from("facebook_posts")
    .select("id, kind, status, page_name, fb_video_id, permalink_url, created_at, properties(id, name, location, map_query, price_minor)")
    .eq("id", postId)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!post) notFound();
  const listing = post.properties as unknown as { id: string; name: string; location: string; map_query: string | null; price_minor: number | null } | null;
  const boostable = post.kind === "video" && post.status === "published" && Boolean(post.fb_video_id);

  // Results for running boosts are read from Meta now; the daily job keeps them fresh too.
  const readBoosts = () =>
    admin
      .from("ad_boosts")
      .select("id, business_id, campaign_id, status, ends_at, starts_at, daily_budget_minor, days, total_minor, area_label, error, spend_minor, reach, impressions, chats, results_at, created_at")
      .eq("facebook_post_id", postId)
      .eq("business_id", biz.businessId)
      .order("created_at", { ascending: false })
      .limit(10);
  let { data: boosts } = await readBoosts();
  if ((boosts ?? []).some((b) => b.status === "active")) {
    await refreshBoosts(admin, (boosts ?? []).filter((b) => b.status === "active") as Parameters<typeof refreshBoosts>[1]).catch(() => 0);
    ({ data: boosts } = await readBoosts());
  }
  const running = (boosts ?? []).find((b) => b.status === "active" || b.status === "creating");

  const cfg = metaConfig();
  const signIn = await adSignIn(admin, biz.businessId);
  const ready = Boolean(cfg && signIn && !signIn.expired);
  const accounts = canSpend && ready && !signIn!.adAccountId ? await adAccounts(fetch, cfg!, signIn!.token).catch(() => null) : null;
  const usable = (accounts ?? []).filter((a) => a.active && a.currency === "PHP");

  // Meta's own estimate of the audience, for the approval panel.
  let estimate: { lower: number; upper: number } | null = null;
  let area = `within ${BOOST_LIMITS.radiusKm} km of ${listing?.location ?? "the listing"}`;
  if (canSpend && boostable && !running && ready && signIn!.adAccountId) {
    const pin = pinOf(listing?.map_query);
    let city: { key: string; name: string } | null = null;
    for (const q of pin ? [] : placeQueries(listing?.location).slice(0, 2)) {
      city = await findCity(fetch, cfg!, signIn!.token, q).catch(() => null);
      if (city) break;
    }
    const place = pin ? { kind: "pin" as const, ...pin, label: listing?.location ?? "" } : city ? { kind: "city" as const, key: city.key, label: city.name } : null;
    if (place) {
      area = `within ${BOOST_LIMITS.radiusKm} km of ${place.label || "the listing"}`;
      estimate = await deliveryEstimate(fetch, cfg!, signIn!.token, signIn!.adAccountId!, boostTargeting(place));
    }
  }
  const suggested = suggestedPlan(listing?.price_minor);
  const notice = typeof sp.notice === "string" ? sp.notice : null;

  return (
    <>
      {back}
      {header}
      {notice === "boost-stopped" ? (
        <div className="mb-4">
          <Alert tone="success">{say("The boost is stopped. It won't spend anything more.", "Natigil na ang boost. Wala na itong gagastusin.")}</Alert>
        </div>
      ) : notice === "boost-stop-failed" ? (
        <div className="mb-4">
          <Alert>
            {say(
              "Facebook didn't confirm the stop. Pause the campaign in Meta Ads Manager to be sure, then reload this page.",
              "Hindi kinumpirma ng Facebook ang pagtigil. I-pause ang campaign sa Meta Ads Manager para sigurado, tapos i-reload ang page.",
            )}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Panel icon3d="rocket" title={running ? "Boost running" : "Your boost"}>
            {!boostable ? (
              <p className="text-sm text-muted">
                {say(
                  "Only a video ad posted to your Page from MyHomeSeller can be boosted here. Photo posts can be boosted with Facebook's own Boost button; the Analyst still shows their results.",
                  "Video ad lang na na-post sa Page mo mula sa MyHomeSeller ang pwedeng i-boost dito. Ang photo posts ay pwedeng i-boost gamit ang Boost button ng Facebook; makikita pa rin ang resulta sa Analyst.",
                )}
              </p>
            ) : running ? (
              <p className="text-sm text-muted">
                {say("This video has a boost running. Its numbers are below.", "May tumatakbong boost ang video na ito. Nasa ibaba ang numbers nito.")}
              </p>
            ) : !canSpend ? (
              <p className="text-sm text-muted">
                {say(
                  "Only the business owner can approve a boost, because it spends the business's own money. Ask the owner to boost this video.",
                  "Ang business owner lang ang pwedeng mag-apruba ng boost, dahil pera ng negosyo ang gagastusin. Ipa-boost sa owner ang video na ito.",
                )}
              </p>
            ) : !ready ? (
              <div className="space-y-3 text-sm">
                <p>
                  {say(
                    "To boost from here, MyHomeSeller needs permission to run ads for you. Connect Facebook again and allow the ad permissions when Facebook asks.",
                    "Para mag-boost dito, kailangan ng MyHomeSeller ng pahintulot na magpatakbo ng ads para sa iyo. I-connect ulit ang Facebook at payagan ang ad permissions kapag nagtanong ang Facebook.",
                  )}
                </p>
                <Link href="/app/integrations" className={buttonClass("primary")}>
                  {say("Go to Connections", "Pumunta sa Connections")}
                </Link>
              </div>
            ) : !signIn!.adAccountId ? (
              accounts === null ? (
                <p className="text-sm text-muted">{say("Facebook didn't list your ad accounts just now. Reload the page in a minute.", "Hindi nailista ng Facebook ang ad accounts mo ngayon. I-reload ang page pagkalipas ng isang minuto.")}</p>
              ) : usable.length ? (
                <form action={chooseAdAccount.bind(null, postId)} className="space-y-4">
                  <Field label={say("Ad account that pays for boosts", "Ad account na magbabayad sa boosts")} htmlFor="account" hint={say("Facebook charges this account. You can change it later.", "Ito ang sisingilin ng Facebook. Pwede mo itong palitan mamaya.")}>
                    <Select id="account" name="account" required>
                      {usable.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton pendingText="Saving…">{say("Use this ad account", "Gamitin ang ad account na ito")}</SubmitButton>
                </form>
              ) : (
                <p className="text-sm">
                  {say(
                    "Your Facebook account has no active ad account in pesos (PHP). Create one in Meta Business Suite, add a payment method, then reload this page.",
                    "Walang active na ad account sa piso (PHP) ang Facebook account mo. Gumawa sa Meta Business Suite, maglagay ng payment method, tapos i-reload ang page.",
                  )}
                </p>
              )
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  {say(
                    `Suggested: ${formatPeso(suggested.dailyMinor)} a day for ${suggested.days} days. Published Philippine figures put a useful test at about ₱300 to ₱500 a day; you can change both.`,
                    `Mungkahi: ${formatPeso(suggested.dailyMinor)} kada araw sa loob ng ${suggested.days} araw. Ayon sa mga nalathalang numero sa Pilipinas, mga ₱300 hanggang ₱500 kada araw ang magandang test; pwede mong baguhin pareho.`,
                  )}
                </p>
                <BoostForm postId={postId} dailyMinor={suggested.dailyMinor} days={suggested.days} accountName={signIn!.adAccountName ?? signIn!.adAccountId!} area={area} />
              </>
            )}
          </Panel>

          {boosts?.length ? (
            <Panel icon3d="chart" title="Boost results">
              <ul className="divide-y divide-line">
                {boosts.map((b) => {
                  const s = STATUS[b.status as BoostStatus];
                  const cpc = costPerChat({ spendMinor: Number(b.spend_minor ?? 0), chats: Number(b.chats ?? 0) });
                  return (
                    <li key={b.id as string} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          <Badge tone={s.tone}>{s.label}</Badge>
                          {formatPeso(Number(b.daily_budget_minor))} a day × {b.days} days
                        </p>
                        {b.status === "active" && canSpend ? (
                          <form action={stopBoost.bind(null, b.id as string)}>
                            <SubmitButton variant="secondary" pendingText="Stopping…">
                              {say("Stop boost", "Itigil ang boost")}
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {b.area_label as string}
                        {b.starts_at ? ` · ${day.format(new Date(b.starts_at as string))} to ${day.format(new Date(b.ends_at as string))}` : ""}
                      </p>
                      {b.status === "failed" ? (
                        <p className="mt-2 text-sm text-hot">{say("Facebook didn't accept this boost, so nothing was spent.", "Hindi tinanggap ng Facebook ang boost na ito, kaya walang nagastos.")} {(b.error as string | null)?.replace(/^Facebook \d+: /, "")}</p>
                      ) : b.results_at ? (
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <div>
                            <dt className="text-muted">Spent</dt>
                            <dd className="font-bold tabular-nums">
                              {formatPeso(Number(b.spend_minor ?? 0))} <span className="font-normal text-muted">of {formatPeso(Number(b.total_minor))}</span>
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">{say("People reached", "Naabot na tao")}</dt>
                            <dd className="font-bold tabular-nums">{n(b.reach as number)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">{say("Chats started", "Nasimulang chats")}</dt>
                            <dd className="font-bold tabular-nums">{n(b.chats as number)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">{say("Cost per chat", "Gastos kada chat")}</dt>
                            <dd className="font-bold tabular-nums">{cpc === null ? "—" : formatPeso(cpc)}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-2 text-sm text-muted">{say("No results from Facebook yet. New ads are reviewed first, usually within a day.", "Wala pang resulta mula sa Facebook. Nire-review muna ang bagong ads, kadalasan sa loob ng isang araw.")}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-muted">
                {say(
                  "Numbers are Facebook's own, read when this page opens and once a day. Chats counted are Messenger conversations Facebook says the ad started.",
                  "Numero ng Facebook mismo, binabasa kapag binuksan ang page at isang beses kada araw. Ang chats ay mga Messenger conversation na sinasabi ng Facebook na sinimulan ng ad.",
                )}
              </p>
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-bold">{say("The video", "Ang video")}</h2>
            <p className="mt-1 text-base font-bold">{listing?.name ?? say("A listing that was since deleted", "Listing na na-delete na")}</p>
            <p className="text-sm text-muted">
              {day.format(new Date(post.created_at as string))} · {post.page_name as string}
            </p>
            {post.permalink_url ? (
              <a href={post.permalink_url as string} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-grape-700 underline underline-offset-2">
                Open on Facebook <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </section>
          {estimate ? (
            <section className="rounded-[1.5rem] bg-tile-sky p-5 text-sm">
              <h2 className="font-bold">{say("Meta's estimate", "Tantiya ng Meta")}</h2>
              <p className="mt-1">
                {say(
                  `About ${n(estimate.lower)} to ${n(estimate.upper)} people use Facebook ${area}. This is Meta's own estimate of the audience, not a promise of reach.`,
                  `Mga ${n(estimate.lower)} hanggang ${n(estimate.upper)} na tao ang gumagamit ng Facebook ${area}. Tantiya ito ng Meta sa audience, hindi pangako ng reach.`,
                )}
              </p>
            </section>
          ) : null}
          <section className="rounded-[1.5rem] bg-tile-lemon p-5 text-xs text-ink/80">
            {say(
              `Limits for every boost: ₱100 to ₱1,000 a day, at most ₱10,000 in all, one boost per video at a time. Shown to adults 18 and over of every gender, ${BOOST_LIMITS.radiusKm} km around the listing, as fair housing rules ask. Every boost is approved by the business owner, and can be stopped any time.`,
              `Limit sa bawat boost: ₱100 hanggang ₱1,000 kada araw, hanggang ₱10,000 lahat, isang boost kada video sa isang pagkakataon. Ipapakita sa edad 18 pataas, anumang kasarian, ${BOOST_LIMITS.radiusKm} km sa palibot ng listing, ayon sa fair housing. Inaaprubahan ng business owner ang bawat boost, at pwedeng itigil kahit kailan.`,
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
