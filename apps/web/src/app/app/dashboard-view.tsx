import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Handshake,
  Home,
  Megaphone,
  MessageCircle,
  Plus,
  Rocket,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { Icon3d } from "@/components/icon-3d";
import { InstallBanner } from "@/components/install-app";
import { changePct, type PerfPoint } from "@/lib/dashboard-stats";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/property-labels";
import { PerformanceChart } from "./performance-chart";

export type Activity = { at: string; icon: LucideIcon; tone: string; title: string; detail: string; href?: string };
export type ListingRow = { id: string; name: string; location: string; price_minor: number; currency: string; status: string; is_public: boolean; coverUrl?: string | null };
export type SetupStep = { label: string; done: boolean; href?: string; soon?: boolean };
/** Something the AI did or has waiting. `at` is when; without it the row is pinned first as "Now". */
export type AiItem = { kind: "chat" | "buyers" | "tasks" | "run"; title: string; detail: string; at?: string; href?: string };

export type DashboardData = {
  greetingText: string;
  dateText: string;
  firstName: string;
  businessName: string;
  notice?: string;
  canCreateProperty: boolean;
  canManageTeam: boolean;
  plan: { code: string; name: string; priceMinor: number };
  properties: ListingRow[];
  steps: SetupStep[];
  recent: Activity[];
  /** Inquiries nobody has answered yet (the bell); null if this role can't see leads. */
  unanswered: number | null;
  /** New inquiries in the last 30 days and in the 30 before; null if this role can't see leads. */
  inquiries: { total: number; previous: number | null } | null;
  /** Viewings held or booked this calendar month and last; null if this role can't see leads. */
  viewings: { thisMonth: number; lastMonth: number } | null;
  /** Leads past the first inquiry (qualified, viewing, offer, reservation); null if this role can't see leads. */
  potentialBuyers: number | null;
  /** Buyer Finder this month; null on Free or for roles that don't work leads. */
  finder: { used: number; limit: number | null } | null;
  /** always: answering on Messenger around the clock. on: working on leads only. almost: paid, nothing to work on yet. off: Free. */
  assistant: "always" | "on" | "almost" | "off";
  aiActivity: AiItem[];
  /** Last 30 days as running totals, and the listing with the most interest; null for roles that can't see reports. */
  performance: { points: PerfPoint[]; top: { id: string; views: number; inquiries: number } | null } | null;
  facebookConnected: boolean;
  now?: Date;
};

const AI_ICON: Record<AiItem["kind"], { icon: LucideIcon; tone: string }> = {
  chat: { icon: MessageCircle, tone: "bg-[#12a356]" },
  buyers: { icon: Users, tone: "bg-[#2f6fed]" },
  tasks: { icon: ClipboardCheck, tone: "bg-[#e2700c]" },
  run: { icon: Bot, tone: "bg-[#7c4ff0]" },
};

const ASSISTANT = {
  always: { title: "Your AI agent is working for you!", pill: "Active 24/7" },
  on: { title: "Your AI agent is working for you!", pill: "Active" },
  almost: { title: "Your AI agent is almost ready", pill: "Almost ready" },
  off: { title: "Switch on your AI agent", pill: "Off on Free" },
} as const;

/** Presentational dashboard. All numbers come from real records passed in. */
export function DashboardView({
  greetingText,
  dateText,
  firstName,
  businessName,
  notice,
  canCreateProperty,
  canManageTeam,
  plan,
  properties,
  steps,
  recent,
  unanswered,
  inquiries,
  viewings,
  potentialBuyers,
  finder,
  assistant,
  aiActivity,
  performance,
  facebookConnected,
  now,
}: DashboardData) {
  const doneCount = steps.filter((s) => s.done).length;
  const setupDone = doneCount === steps.length;
  const paid = plan.code !== "free";
  const firstListing = properties.find((p) => p.status === "available") ?? properties[0];
  const active = properties.filter((p) => p.status === "available").length;
  const live = assistant === "always" || assistant === "on";
  const showAi = aiActivity.length > 0;
  const top = performance?.top ? properties.find((p) => p.id === performance.top!.id) : undefined;
  const featured = top ?? firstListing;
  const lastPoint = performance?.points.at(-1);
  const hasActivity = Boolean(lastPoint && lastPoint.views + lastPoint.inquiries + lastPoint.viewings > 0);

  return (
    <div className="pp-stagger space-y-6">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <InstallBanner />

      {/* Greeting */}
      <header style={{ "--i": 0 } as React.CSSProperties} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[2.25rem]">
            {greetingText}
            {firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="mt-1 text-[15px] text-muted">Here&apos;s what&apos;s happening with your properties. {dateText}.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/app/billing"
            className="rounded-full bg-tile-mint px-3 py-1.5 text-xs font-bold text-brand-700 hover:ring-2 hover:ring-brand-100"
          >
            {plan.name.toUpperCase()} {paid ? `· ${formatPeso(plan.priceMinor)} / month` : "· upgrade for AI"}
          </Link>
          {unanswered !== null ? (
            <Link
              href="/app/leads"
              aria-label={unanswered ? `${unanswered} new ${unanswered === 1 ? "inquiry" : "inquiries"} to answer` : "Inquiries"}
              className="pp-bounce relative grid size-11 place-items-center rounded-full border border-line bg-white text-ink shadow-[var(--shadow-card)]"
            >
              <Bell className="size-5" aria-hidden />
              {unanswered ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-hot px-1 text-center text-[11px] font-bold leading-5 text-white tabular-nums">
                  {unanswered > 99 ? "99+" : unanswered}
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
      </header>

      {/* Key numbers */}
      <section style={{ "--i": 1 } as React.CSSProperties} aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          icon={Home}
          circle="from-[#3b82f6] to-[#1d4ed8]"
          tile="bg-tile-sky"
          label="Total properties"
          value={<CountUp value={properties.length} />}
          note={
            properties.length === 0 ? (
              "Add your first one"
            ) : active === properties.length ? (
              <span className="inline-flex items-center gap-1 font-semibold text-good">
                <CircleCheck className="size-3.5" aria-hidden /> All active
              </span>
            ) : (
              `${active} active`
            )
          }
          href="/app/properties"
        />
        <Stat
          icon={Users}
          circle="from-[#22b866] to-[#0b8a47]"
          tile="bg-tile-mint"
          label="Buyer inquiries"
          value={inquiries ? <CountUp value={inquiries.total} /> : "—"}
          trend={inquiries && inquiries.previous !== null ? changePct(inquiries.total, inquiries.previous) : null}
          note={inquiries ? (inquiries.previous ? "vs previous 30 days" : "Last 30 days") : "For sales roles"}
          href={inquiries ? "/app/leads" : undefined}
        />
        <Stat
          icon={CalendarDays}
          circle="from-[#e8780c] to-[#c2540a]"
          tile="bg-tile-peach"
          label="Viewing appointments"
          value={viewings ? <CountUp value={viewings.thisMonth} /> : "—"}
          trend={viewings ? changePct(viewings.thisMonth, viewings.lastMonth) : null}
          note={viewings ? (viewings.lastMonth ? "This month, vs last" : "This month") : "For sales roles"}
          href={viewings ? "/app/leads?show=scheduled" : undefined}
        />
        <Stat
          icon={Handshake}
          circle="from-[#8b5cf6] to-[#5b34c9]"
          tile="bg-tile-lavender"
          label="Potential buyers"
          value={potentialBuyers === null ? "—" : <CountUp value={potentialBuyers} />}
          note={
            potentialBuyers === null
              ? "For sales roles"
              : finder && finder.limit !== null
                ? `Buyer Finder: ${finder.used} of ${finder.limit} used`
                : "From qualified leads"
          }
          href={potentialBuyers === null ? undefined : "/app/pipeline"}
        />
      </section>

      {/* The AI agent, and what it has been doing */}
      <div style={{ "--i": 2 } as React.CSSProperties} className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section
          aria-labelledby="agent-title"
          className="relative isolate flex flex-col overflow-hidden rounded-[2rem] bg-frame-1 text-white shadow-[var(--shadow-lift)] sm:min-h-80 sm:flex-row sm:items-center xl:col-span-3"
        >
          {/* The house scene with the mascot in front: a banner on top on phones, the whole card behind the text on wider screens. */}
          <div aria-hidden className="relative h-48 shrink-0 sm:absolute sm:inset-0 sm:-z-10 sm:h-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
            <img src="/images/dashboard/house.webp" alt="" width={1600} height={893} className="size-full object-cover object-[30%_55%]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent from-45% to-frame-1 to-95% sm:bg-gradient-to-r sm:from-transparent sm:from-20% sm:via-frame-1/85 sm:via-50% sm:to-frame-1 sm:to-75%" />
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
            <img
              src="/images/dashboard/mascot.webp"
              alt=""
              width={641}
              height={720}
              className="absolute -bottom-2 left-4 h-[10.5rem] w-auto drop-shadow-[0_16px_22px_rgb(20_10_60/0.45)] sm:bottom-0 sm:left-5 sm:h-[90%]"
            />
          </div>
          <div className="relative min-w-0 p-6 pt-5 sm:ml-auto sm:w-[55%] sm:py-8 sm:pl-0 sm:pr-8">
            <h2 id="agent-title" className="text-[1.6rem] leading-[1.15] font-extrabold tracking-tight text-balance sm:text-[2rem]">
              {ASSISTANT[assistant].title}
            </h2>
            <p
              className={cx(
                "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                live ? "bg-[#e2f6ea] text-[#0a6d39]" : "bg-white/15 text-white",
              )}
            >
              {live ? <CircleCheck className="size-4" aria-hidden /> : null}
              {ASSISTANT[assistant].pill}
            </p>
            <p className="mt-3 max-w-md text-[15px] text-white/80">
              {assistant === "always"
                ? `Answering buyers on Messenger, sizing up each lead and finding potential buyers for ${businessName}.`
                : assistant === "on"
                  ? "Sizing up each lead and finding potential buyers. Connect your Facebook Page and it answers buyers on Messenger too."
                  : assistant === "almost"
                    ? "Give a listing a public page or connect your Facebook Page, and it starts answering buyers and sizing up leads."
                    : "On Basic it answers buyers on Messenger, sizes up each lead and finds potential buyers for you."}
            </p>
            <Link
              href={live ? "/app/agents" : assistant === "almost" ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/billing"}
              className={buttonClass("inverse", "mt-5")}
            >
              {live ? "View AI activity" : assistant === "almost" ? (firstListing ? "Open your listing" : "Add a property") : "See plans, from ₱499 a month"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <Panel
          className="xl:col-span-2"
          icon={<Zap className="size-5 fill-[#fbbf24] text-[#fbbf24]" aria-hidden />}
          title={showAi ? "AI agent activity" : "Recent activity"}
          action={showAi ? { href: "/app/agents", label: "View all" } : undefined}
        >
          {showAi ? (
            <ul className="divide-y divide-line px-5">
              {aiActivity.map((a, i) => {
                const { icon: Icon, tone } = AI_ICON[a.kind];
                return (
                  <li key={`${a.kind}-${i}`}>
                    <Row
                      href={a.href}
                      icon={
                        <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-white", tone)}>
                          <Icon className="size-5" aria-hidden />
                        </span>
                      }
                      title={a.title}
                      detail={a.detail}
                      when={a.at ? timeAgo(a.at, now) : "Now"}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <ActivityList recent={recent} now={now} />
          )}
        </Panel>
      </div>

      {/* Performance, and shortcuts */}
      <div style={{ "--i": 3 } as React.CSSProperties} className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {performance ? (
          <section aria-labelledby="perf-title" className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6 xl:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Icon3d name="chart" size={36} />
                <h2 id="perf-title" className="text-xl font-extrabold tracking-tight">
                  Property performance
                </h2>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-full border border-line px-3 py-1 font-semibold">Last 30 days</span>
                <Link href="/app/reports" className="font-bold text-grape-700 hover:underline">
                  Full reports
                </Link>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[10.5rem_minmax(0,1fr)]">
              {featured ? (
                <Link href={`/app/properties/${featured.id}`} className="pp-lift flex gap-3 rounded-2xl sm:block">
                  {featured.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail
                    <img src={featured.coverUrl} alt="" className="aspect-[4/3] w-28 shrink-0 rounded-2xl object-cover sm:w-full" />
                  ) : (
                    <span className="grid aspect-[4/3] w-28 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-tile-lavender to-tile-sky sm:w-full">
                      <Icon3d name="houses" size={48} />
                    </span>
                  )}
                  <span className="block min-w-0 sm:mt-2.5">
                    <span className="line-clamp-2 text-sm font-bold leading-snug">{featured.name}</span>
                    <span
                      className={cx(
                        "mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold",
                        featured.status === "available" ? "bg-tile-mint text-brand-700" : "bg-surface text-muted",
                      )}
                    >
                      {featured.status === "available" ? "Active" : STATUS_LABEL[featured.status as keyof typeof STATUS_LABEL]}
                    </span>
                    <span className="mt-1.5 block text-xs text-muted tabular-nums">
                      {top && performance.top
                        ? `Most interest: ${plural(performance.top.views, "view")}, ${plural(performance.top.inquiries, "inquiry", "inquiries")}`
                        : "No views yet"}
                    </span>
                  </span>
                </Link>
              ) : (
                <div className="rounded-2xl border-2 border-dashed border-grape-100 p-4 text-center">
                  <Icon3d name="houses" size={48} className="mx-auto" />
                  <p className="mt-2 text-sm font-bold">No listings yet</p>
                  {canCreateProperty ? (
                    <Link href="/app/properties/new" className="mt-1 inline-block text-sm font-bold text-grape-700 hover:underline">
                      Add a property
                    </Link>
                  ) : null}
                </div>
              )}
              <div className="min-w-0">
                {hasActivity ? (
                  <>
                    <PerformanceChart points={performance.points} />
                    <p className="mt-3 text-xs text-muted">Running totals across all your listings. Views are of public listing pages.</p>
                  </>
                ) : (
                  <p className="grid h-full min-h-40 place-items-center rounded-2xl border-2 border-dashed border-grape-100 px-4 py-8 text-center text-sm text-muted">
                    No views, inquiries or viewings in the last 30 days. Share a listing&apos;s public page to start.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        <Panel className={performance ? "xl:col-span-2" : "xl:col-span-5"} icon={<Rocket className="size-5" aria-hidden />} title="Quick actions">
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 p-4">
            <Action
              href={canCreateProperty ? "/app/properties/new" : "/app/properties"}
              icon={canCreateProperty ? Plus : Home}
              tone="from-[#2f6fed] to-[#1e4fd0]"
              label={canCreateProperty ? "Add a property" : "Open properties"}
            />
            <Action
              href={facebookConnected ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/integrations"}
              icon={Megaphone}
              tone="from-[#12a356] to-[#0b7a3f]"
              label={facebookConnected ? "Post a listing on Facebook" : "Connect your Facebook Page"}
            />
            <Action
              href={performance ? "/app/reports" : "/app/pipeline"}
              icon={BarChart3}
              tone="from-[#7c4ff0] to-[#5a31c7]"
              label={performance ? "View detailed reports" : "Open your pipeline"}
            />
            <div className="flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-2xl bg-tile-peach p-4 text-brass-700 sm:flex-row sm:items-center sm:justify-start sm:gap-3">
              <Video className="size-6 shrink-0" aria-hidden />
              <span className="min-w-0 text-[15px] leading-tight font-bold">
                Create property video
                <span className="mt-0.5 block text-xs font-semibold opacity-80">Coming soon</span>
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Setup while it's unfinished, and recent activity when the panel above shows the AI instead */}
      {!setupDone || showAi ? (
        <div style={{ "--i": 4 } as React.CSSProperties} className={cx("grid grid-cols-1 gap-5", !setupDone && showAi && "lg:grid-cols-2")}>
          {!setupDone ? (
            <section className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <Icon3d name="rocket" size={44} />
                <div className="flex-1">
                  <h2 className="text-xl font-extrabold tracking-tight">Get set up</h2>
                  <p className="text-sm text-muted tabular-nums">
                    {doneCount} of {steps.length} done
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-grape-50" role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
                <div className="pp-grow h-full rounded-full bg-grape-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
              <ul className="mt-4 space-y-0.5">
                {steps.map((s) => {
                  const row = (
                    <span className="flex items-center gap-3 px-2 py-1.5 text-sm">
                      {s.done ? (
                        <CircleCheck className="size-5 shrink-0 text-brand-600" aria-hidden />
                      ) : (
                        <span className="size-5 shrink-0 rounded-full border-2 border-grape-100" aria-hidden />
                      )}
                      <span className={cx("flex-1", s.done ? "text-muted line-through decoration-muted/40" : "font-medium")}>{s.label}</span>
                      {s.soon ? <span className="rounded-full bg-grape-50 px-2 py-0.5 text-xs text-grape-700">Coming soon</span> : null}
                      <span className="sr-only">{s.done ? "Done" : "Not done"}</span>
                    </span>
                  );
                  return (
                    <li key={s.label}>
                      {!s.done && s.href ? (
                        <Link href={s.href} className="block rounded-xl hover:bg-grape-50">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
              {canManageTeam ? (
                <Link href="/app/team" className="mt-3 inline-block px-2 text-sm font-bold text-grape-700 hover:underline">
                  Invite a teammate
                </Link>
              ) : null}
            </section>
          ) : null}
          {showAi ? (
            <section className="rounded-[1.5rem] border border-line bg-white pb-2 pt-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3 px-6">
                <Icon3d name="bell" size={44} />
                <h2 className="text-xl font-extrabold tracking-tight">Recent activity</h2>
              </div>
              <ActivityList recent={recent} now={now} />
            </section>
          ) : null}
        </div>
      ) : null}

      {/* Closing banner */}
      <section
        style={{ "--i": 5 } as React.CSSProperties}
        className="relative isolate flex flex-wrap items-center justify-between gap-x-6 gap-y-4 overflow-hidden rounded-[1.5rem] border border-line p-6 sm:py-9"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/skyline.webp" alt="" width={2000} height={481} loading="lazy" className="absolute inset-0 -z-20 size-full object-cover object-[100%_10%]" />
        {/* A wash in the card's color keeps the words readable in both themes; the skyline shows through on the right. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--pp-card)] from-25% via-[var(--pp-card)]/75 via-55% to-transparent max-sm:from-0% max-sm:via-[var(--pp-card)]/85 max-sm:to-[var(--pp-card)]/55"
        />
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">Turn your property into profit!</h2>
          <p className="mt-1 max-w-xl text-sm text-ink/80">
            {paid
              ? "Share a listing's public page on Facebook and Messenger. Every inquiry lands in your pipeline, ready to follow up."
              : "With MyHomeSeller on Basic, every buyer gets an answer and you see which leads fit each listing."}
          </p>
        </div>
        <Link
          href={paid ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/billing"}
          className={buttonClass("primary", "max-sm:w-full")}
        >
          {paid ? (firstListing ? "Share a listing" : "Add a property") : "See plans, from ₱499 a month"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** A key number: round colored icon, the figure, and how it changed. */
function Stat({
  icon: Icon,
  circle,
  tile,
  label,
  value,
  trend,
  note,
  href,
}: {
  icon: LucideIcon;
  circle: string;
  tile: string;
  label: string;
  value: ReactNode;
  trend?: number | null;
  note: ReactNode;
  href?: string;
}) {
  const className = cx("flex flex-col gap-3 rounded-[var(--radius-tile)] p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5", tile, href && "pp-lift");
  const body = (
    <>
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.45)] sm:size-14", circle)}>
        <Icon className="size-6 sm:size-7" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink/80">{label}</span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[2rem] leading-none font-extrabold tracking-tight sm:text-[2.4rem]">{value}</span>
          {trend === null || trend === undefined ? null : (
            <span className={cx("inline-flex items-center text-sm font-bold tabular-nums", trend > 0 ? "text-good" : trend < 0 ? "text-hot" : "text-muted")}>
              {trend > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : trend < 0 ? <ArrowDown className="size-3.5" aria-hidden /> : null}
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </span>
        <span className="mt-1 block text-xs text-muted">{note}</span>
      </span>
      {href ? <ChevronRight className="size-5 shrink-0 text-ink/40 max-2xl:hidden" aria-hidden /> : null}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A card with a dark title bar, like the mockup's activity and quick-action panels. */
function Panel({
  icon,
  title,
  action,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx("flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-center justify-between gap-3 bg-frame-1 px-5 py-3.5 text-white">
        <h2 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          {icon}
          {title}
        </h2>
        {action ? (
          <Link href={action.href} className="inline-flex items-center gap-1 text-sm font-semibold text-white/85 hover:text-white">
            {action.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Row({ href, icon, title, detail, when }: { href?: string; icon: ReactNode; title: string; detail: string; when: string }) {
  const body = (
    <span className="flex items-start gap-3 py-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <span className="shrink-0 pt-0.5 text-xs text-muted">{when}</span>
    </span>
  );
  return href ? (
    <Link href={href} className="-mx-2 block rounded-xl px-2 hover:bg-grape-50">
      {body}
    </Link>
  ) : (
    body
  );
}

function ActivityList({ recent, now }: { recent: Activity[]; now?: Date }) {
  if (recent.length === 0) return <p className="px-5 py-6 text-sm text-muted">Nothing yet. Activity from your team and listings shows up here.</p>;
  return (
    <ul className="divide-y divide-line px-5">
      {recent.map((a, i) => {
        const Icon = a.icon;
        return (
          <li key={`${a.title}-${a.at}-${i}`}>
            <Row
              href={a.href}
              icon={
                <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", a.tone)}>
                  <Icon className="size-5" aria-hidden />
                </span>
              }
              title={a.title}
              detail={a.detail}
              when={timeAgo(a.at, now)}
            />
          </li>
        );
      })}
    </ul>
  );
}

function Action({ href, icon: Icon, tone, label }: { href: string; icon: LucideIcon; tone: string; label: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "pp-lift pp-bounce flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-2xl bg-gradient-to-br p-4 text-[15px] leading-tight font-bold text-white sm:flex-row sm:items-center sm:justify-start sm:gap-3",
        tone,
      )}
    >
      <Icon className="size-6 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
