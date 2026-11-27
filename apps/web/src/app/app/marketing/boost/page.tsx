import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Rocket } from "lucide-react";
import { can } from "@propilot/shared";
import { Badge, buttonClass, EmptyState, PageHeader, Panel, StatTile } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { boostsIncluded, costPerChat, type BoostStatus } from "@/lib/boost-rules";
import { refreshBoosts } from "@/lib/boosts";
import { appSay } from "@/lib/lang-server";
import { formatPeso } from "@/lib/money";
import { businessPlan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Boost & Ads" };
// Running boosts' results are read from Meta when the page opens.
export const maxDuration = 30;

const STATUS: Record<BoostStatus, { label: string; tone: "neutral" | "brand" | "hot" }> = {
  creating: { label: "Starting", tone: "neutral" },
  active: { label: "Running", tone: "brand" },
  stopped: { label: "Stopped", tone: "neutral" },
  finished: { label: "Finished", tone: "neutral" },
  failed: { label: "Didn't start", tone: "hot" },
};
const day = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
const n = (v: number) => v.toLocaleString("en-PH");

type BoostRow = {
  id: string;
  business_id: string;
  facebook_post_id: string;
  campaign_id: string | null;
  status: BoostStatus;
  starts_at: string | null;
  ends_at: string | null;
  daily_budget_minor: number;
  days: number;
  total_minor: number;
  spend_minor: number | null;
  reach: number | null;
  chats: number | null;
  results_at: string | null;
  created_at: string;
  properties: { name: string } | null;
};

/** Boost & Ads: every boost made from MyHomeSeller with what it spent and brought in, and the videos ready to boost. */
export default async function BoostsPage() {
  const biz = await requireBusiness();
  if (!can(biz.role, "analytics.view") && !can(biz.role, "content.publish")) redirect("/app/marketing");
  const [plan, say] = await Promise.all([businessPlan(biz.businessId), appSay()]);
  const back = (
    <Link href="/app/marketing" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Marketing Agent
    </Link>
  );
  const header = (
    <PageHeader
      icon3d="rocket"
      tone="lemon"
      title="Boost & Ads"
      description={say(
        "Boost your video ads for Messenger chats, with your OK on every spend, and see what each boost spent and brought in.",
        "I-boost ang video ads mo para sa Messenger chats, may OK mo sa bawat gastos, at tingnan kung magkano ang nagastos at ilan ang naging chats.",
      )}
      action={
        <Link href="/app/marketing/analyst" className={buttonClass("secondary")}>
          {say("How posts are doing", "Kumusta ang posts")}
        </Link>
      }
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
            "Posts boosted with Facebook's own Boost button still show in the Analyst on every plan.",
            "Makikita pa rin sa Analyst ang posts na na-boost gamit ang Boost button ng Facebook, sa kahit anong plan.",
          )}
        </EmptyState>
      </>
    );
  }

  const supabase = await createClient();
  const readBoosts = () =>
    supabase
      .from("ad_boosts")
      .select("id, business_id, facebook_post_id, campaign_id, status, starts_at, ends_at, daily_budget_minor, days, total_minor, spend_minor, reach, chats, results_at, created_at, properties(name)")
      .eq("business_id", biz.businessId)
      .order("created_at", { ascending: false })
      .limit(50);
  let { data: boosts } = await readBoosts();
  // Fresh numbers for running boosts (up to 5 here; the daily job covers the rest).
  const running = ((boosts ?? []) as unknown as BoostRow[]).filter((b) => b.status === "active").slice(0, 5);
  const admin = running.length ? createAdminClient() : null;
  if (admin) {
    await refreshBoosts(admin, running).catch(() => 0);
    ({ data: boosts } = await readBoosts());
  }
  const rows = (boosts ?? []) as unknown as BoostRow[];

  // Videos posted from the app with no boost running.
  const { data: videos } = await supabase
    .from("facebook_posts")
    .select("id, created_at, page_name, properties(name)")
    .eq("business_id", biz.businessId)
    .eq("kind", "video")
    .eq("status", "published")
    .not("fb_video_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const busy = new Set(rows.filter((b) => b.status === "active" || b.status === "creating").map((b) => b.facebook_post_id));
  const ready = (videos ?? []).filter((v) => !busy.has(v.id as string)).slice(0, 8);

  const spent = rows.reduce((s, b) => s + Number(b.spend_minor ?? 0), 0);
  const chats = rows.reduce((s, b) => s + Number(b.chats ?? 0), 0);
  const cpc = costPerChat({ spendMinor: spent, chats });
  const live = rows.filter((b) => b.status === "active").length;

  return (
    <>
      {back}
      {header}

      {rows.length ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="rocket" tone="lemon" label={say("Running now", "Tumatakbo ngayon")} value={n(live)} />
          <StatTile icon="money" tone="mint" label={say("Spent on boosts", "Nagastos sa boosts")} value={formatPeso(spent)} note={say("All boosts made here", "Lahat ng boost na ginawa dito")} />
          <StatTile icon="chat" tone="sky" label={say("Chats started", "Nasimulang chats")} value={n(chats)} />
          <StatTile icon="target" tone="peach" label={say("Cost per chat", "Gastos kada chat")} value={cpc === null ? "—" : formatPeso(cpc)} />
        </div>
      ) : null}

      <div className="space-y-6">
        <Panel icon3d="camera" title="Videos ready to boost">
          {ready.length ? (
            <ul className="divide-y divide-line">
              {ready.map((v) => (
                <li key={v.id as string} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block font-semibold">{(v.properties as unknown as { name: string } | null)?.name ?? say("A listing that was since deleted", "Listing na na-delete na")}</span>
                    <span className="text-sm text-muted">
                      {say("Posted", "Na-post")} {day.format(new Date(v.created_at as string))} · {v.page_name as string}
                    </span>
                  </span>
                  <Link href={`/app/marketing/boost/${v.id}`} className={buttonClass("primary")}>
                    <Rocket className="size-4" aria-hidden /> {say("Boost", "I-boost")}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm">
              <p className="text-muted">
                {say(
                  "No video ad is waiting to be boosted. Make one in the Video Ad Maker and post it to your Page; it shows up here.",
                  "Walang video ad na naghihintay ma-boost. Gumawa sa Video Ad Maker at i-post sa Page mo; lalabas ito dito.",
                )}
              </p>
              <Link href="/app/video" className={buttonClass("secondary", "mt-3")}>
                {say("Make a video ad", "Gumawa ng video ad")}
              </Link>
            </div>
          )}
        </Panel>

        <Panel icon3d="chart" title="Your boosts" flush>
          {rows.length ? (
            <ul className="divide-y divide-line">
              {rows.map((b) => {
                const s = STATUS[b.status];
                const c = costPerChat({ spendMinor: Number(b.spend_minor ?? 0), chats: Number(b.chats ?? 0) });
                return (
                  <li key={b.id}>
                    <Link href={`/app/marketing/boost/${b.facebook_post_id}`} className="block px-5 py-4 hover:bg-grape-50 sm:px-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex min-w-0 items-center gap-2 font-semibold">
                          <Badge tone={s.tone}>{s.label}</Badge>
                          <span className="truncate">{b.properties?.name ?? say("A listing that was since deleted", "Listing na na-delete na")}</span>
                        </p>
                        <p className="text-sm text-muted tabular-nums">
                          {formatPeso(b.daily_budget_minor)} a day × {b.days} days
                          {b.starts_at ? ` · ${day.format(new Date(b.starts_at))}` : ""}
                        </p>
                      </div>
                      {b.status === "failed" ? (
                        <p className="mt-1 text-sm text-muted">{say("Facebook didn't accept it, so nothing was spent. Open it to see why.", "Hindi tinanggap ng Facebook, kaya walang nagastos. Buksan para makita kung bakit.")}</p>
                      ) : b.results_at ? (
                        <p className="mt-1 text-sm tabular-nums">
                          {say("Spent", "Nagastos")} <span className="font-bold">{formatPeso(Number(b.spend_minor ?? 0))}</span> {say("of", "sa")} {formatPeso(b.total_minor)} · {n(Number(b.reach ?? 0))} {say("reached", "naabot")} ·{" "}
                          <span className="font-bold">{n(Number(b.chats ?? 0))}</span> {say("chats", "chats")}
                          {c !== null ? ` · ${formatPeso(c)} ${say("per chat", "kada chat")}` : ""}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted">{say("No results from Facebook yet.", "Wala pang resulta mula sa Facebook.")}</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted sm:p-6">{say("No boosts yet. Boost a video above; it shows here with what it spent and the chats it brought.", "Wala pang boost. Mag-boost ng video sa itaas; lalabas ito dito kasama ang nagastos at mga chat na dinala nito.")}</p>
          )}
        </Panel>

        <p className="text-sm text-muted">
          {say("Posts boosted with Facebook's own Boost button show in the ", "Ang posts na na-boost gamit ang Boost button ng Facebook ay nasa ")}
          <Link href="/app/marketing/analyst" className="font-semibold text-grape-700 underline underline-offset-2">
            Analyst
          </Link>
          {say(", with the views that came from ads.", ", kasama ang views na galing sa ads.")}
        </p>
      </div>
    </>
  );
}
