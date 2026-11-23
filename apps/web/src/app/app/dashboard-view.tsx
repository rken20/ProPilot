import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Handshake,
  Headset,
  Home,
  Megaphone,
  MessageCircle,
  PhilippinePeso,
  Plus,
  Rocket,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, cx, titleCase } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { CountUp } from "@/components/count-up";
import { Icon3d } from "@/components/icon-3d";
import { InstallBanner } from "@/components/install-app";
import { UsageNotice } from "@/components/usage-notice";
import type { UsageItem } from "@/lib/usage-rules";
import { changePct, type PerfPoint } from "@/lib/dashboard-stats";
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
  /** The person's full name and profile photo, for the corner of the greeting. */
  fullName: string;
  avatarUrl: string | null;
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
  /** always: answering on Messenger around the clock. on: working on leads only. almost: paid, nothing to work on yet. off: Free. */
  assistant: "always" | "on" | "almost" | "off";
  aiActivity: AiItem[];
  /** Last 30 days as running totals, and the listing with the most interest; null for roles that can't see reports. */
  performance: { points: PerfPoint[]; top: { id: string; views: number; inquiries: number } | null } | null;
  facebookConnected: boolean;
  /** Whether the plan includes the Pricing Advisor (Agency). The button shows either way. */
  pricingAdvisor: boolean;
  /** This month's AI allowances; a notice shows when one is low or used up. */
  usage: UsageItem[];
  canSeeBilling: boolean;
  now?: Date;
};

const AI_ICON: Record<AiItem["kind"], { icon: LucideIcon; tone: string }> = {
  chat: { icon: MessageCircle, tone: "bg-[#12a356]" },
  buyers: { icon: Users, tone: "bg-[#2f6fed]" },
  tasks: { icon: ClipboardCheck, tone: "bg-[#e2700c]" },
  run: { icon: Bot, tone: "bg-[#7c4ff0]" },
};

const ASSISTANT = {
  always: { title: "Your AI Agent is Working for You!", pill: "Active 24/7" },
  on: { title: "Your AI Agent is Working for You!", pill: "Active" },
  almost: { title: "Your AI Agent is Almost Ready", pill: "Almost ready" },
  off: { title: "Switch On Your AI Agent", pill: "Off on Free" },
} as const;

/** Presentational dashboard. All numbers come from real records passed in. */
export function DashboardView({
  greetingText,
  dateText,
  firstName,
  fullName,
  avatarUrl,
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
  assistant,
  aiActivity,
  performance,
  facebookConnected,
  pricingAdvisor,
  usage,
  canSeeBilling,
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
    <div className="pp-stagger space-y-5">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <UsageNotice items={usage} planCode={plan.code} canSeeBilling={canSeeBilling} />
      <InstallBanner />

      {/* Greeting */}
      <header style={{ "--i": 0 } as React.CSSProperties} className="relative isolate flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {/* A house fading into the page behind the bell and the photo, on wide screens. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img
          src="/images/dashboard/house.webp"
          alt=""
          width={1600}
          height={893}
          className="pointer-events-none absolute -top-12 right-16 -z-10 h-36 w-auto max-w-none opacity-60 select-none [mask-image:radial-gradient(ellipse_at_55%_55%,black_30%,transparent_70%)] max-lg:hidden"
        />
        <div className="min-w-0">
          <h1 className="text-[1.6rem] leading-tight font-extrabold tracking-tight text-balance sm:text-[1.9rem]">
            {titleCase(greetingText)}
            {fullName || firstName ? `, ${fullName || firstName}` : ""}!
          </h1>
          <p className="mt-1 text-sm text-muted">Here&apos;s what&apos;s happening with your properties. {dateText}.</p>
        </div>
        <div className="flex items-center gap-3">
          {paid ? null : (
            <Link href="/app/billing" className="rounded-full bg-tile-mint px-3 py-1.5 text-xs font-bold text-brand-700 hover:ring-2 hover:ring-brand-100">
              FREE · upgrade for AI
            </Link>
          )}
          {unanswered !== null ? (
            <Link
              href="/app/leads"
              aria-label={unanswered ? `${unanswered} new ${unanswered === 1 ? "inquiry" : "inquiries"} to answer` : "Inquiries"}
              className="pp-bounce relative grid size-10 place-items-center rounded-full bg-white/90 text-ink shadow-[var(--shadow-card)]"
            >
              <Bell className="size-5" aria-hidden />
              {unanswered ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-hot px-1 text-center text-[11px] font-bold leading-5 text-white tabular-nums">
                  {unanswered > 99 ? "99+" : unanswered}
                </span>
              ) : null}
            </Link>
          ) : null}
          {/* On phones the photo is already in the bar on top. */}
          <Link href="/app/account" aria-label="Your account" className="pp-bounce flex items-center gap-1 rounded-full max-lg:hidden">
            <Avatar name={fullName || firstName} url={avatarUrl} className="size-10 bg-grape-100 text-sm text-grape-700 ring-2 ring-white shadow-[var(--shadow-card)]" />
            <ChevronDown className="size-4 text-ink/60" aria-hidden />
          </Link>
        </div>
      </header>

      {/* Key numbers */}
      <section style={{ "--i": 1 } as React.CSSProperties} aria-label="Key numbers" className="relative grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          icon={Home}
          circle="from-[#3b82f6] to-[#1d4ed8]"
          tile="bg-tile-sky"
          label="Total Properties"
          chevron
          value={<CountUp value={properties.length} />}
          note={
            properties.length === 0 ? (
              "Add your first one"
            ) : active === properties.length ? (
              <span className="inline-flex items-center gap-1 font-semibold text-good">
                <CircleCheck className="size-3.5" aria-hidden /> All Active
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
          label="Buyer Inquiries"
          value={inquiries ? <CountUp value={inquiries.total} /> : "—"}
          trend={inquiries && inquiries.previous !== null ? changePct(inquiries.total, inquiries.previous) : null}
          note={inquiries ? (inquiries.previous ? "vs previous 30 days" : "Last 30 days") : "For sales roles"}
          href={inquiries ? "/app/leads" : undefined}
        />
        <Stat
          icon={CalendarDays}
          circle="from-[#e8780c] to-[#c2540a]"
          tile="bg-tile-peach"
          label="Viewing Appointments"
          value={viewings ? <CountUp value={viewings.thisMonth} /> : "—"}
          trend={viewings ? changePct(viewings.thisMonth, viewings.lastMonth) : null}
          note={viewings ? (viewings.lastMonth ? "this month, vs last" : "this month") : "For sales roles"}
          href={viewings ? "/app/leads?show=scheduled" : undefined}
        />
        <Stat
          icon={Handshake}
          circle="from-[#8b5cf6] to-[#5b34c9]"
          tile="bg-tile-lavender"
          label="Potential Buyers"
          chevron
          value={potentialBuyers === null ? "—" : <CountUp value={potentialBuyers} />}
          note={potentialBuyers === null ? "For sales roles" : "from qualified leads"}
          href={potentialBuyers === null ? undefined : "/app/pipeline"}
        />
      </section>

      {/* The AI agent, and what it has been doing */}
      <div style={{ "--i": 2 } as React.CSSProperties} className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section
          aria-labelledby="agent-title"
          className="relative isolate flex flex-col overflow-hidden rounded-[2rem] border border-[var(--hero-line)] bg-[var(--hero-wash)] text-[var(--hero-ink)] shadow-[var(--shadow-card)] sm:min-h-64 sm:flex-row sm:items-center xl:col-span-3"
        >
          {/* The house scene with the mascot in front: a banner on top on phones, the left of the card on wider screens. */}
          <div aria-hidden className="relative h-44 shrink-0 sm:absolute sm:inset-0 sm:-z-10 sm:h-auto">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
            <img src="/images/dashboard/house.webp" alt="" width={1600} height={893} className="size-full object-cover object-[30%_55%]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent from-55% to-[var(--hero-wash)] to-100% sm:bg-gradient-to-r sm:from-transparent sm:from-25% sm:via-[var(--hero-wash)]/90 sm:via-50% sm:to-[var(--hero-wash)] sm:to-68%" />
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
            <img
              src="/images/dashboard/mascot.webp"
              alt=""
              width={641}
              height={720}
              className="absolute -bottom-2 left-4 h-[9.5rem] w-auto drop-shadow-[0_16px_22px_rgb(10_31_77/0.35)] sm:bottom-0 sm:left-5 sm:h-[90%]"
            />
          </div>
          <div className="relative min-w-0 p-5 pt-4 sm:ml-auto sm:w-[53%] sm:py-6 sm:pl-0 sm:pr-7">
            <h2 id="agent-title" className="text-[1.45rem] leading-[1.15] font-extrabold tracking-tight text-balance sm:text-[1.7rem]">
              {ASSISTANT[assistant].title}
            </h2>
            <p
              className={cx(
                "mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-sm font-bold",
                live ? "border-[#9fdcb8] bg-[#e2f6ea] text-[#0a6d39]" : "border-[var(--hero-line)] bg-white/60 text-[#0a1f4d]",
              )}
            >
              {live ? <CircleCheck className="size-4.5 fill-[#12a356] text-white" aria-hidden /> : null}
              {ASSISTANT[assistant].pill}
            </p>
            <p className="mt-2.5 max-w-md text-sm opacity-85">
              {assistant === "always"
                ? `Finding buyers, answering inquiries and sizing up every lead for ${businessName}.`
                : assistant === "on"
                  ? "Sizing up each lead and finding potential buyers. Connect your Facebook Page and it answers buyers on Messenger too."
                  : assistant === "almost"
                    ? "Give a listing a public page or connect your Facebook Page, and it starts answering buyers and sizing up leads."
                    : "On Basic it answers buyers on Messenger, sizes up each lead and finds potential buyers for you."}
            </p>
            <Link
              href={live ? "/app/agents" : assistant === "almost" ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/billing"}
              className="pp-bounce mt-4 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1565e6] px-5 text-sm font-bold text-white shadow-[0_8px_18px_-8px_rgb(21_101_230/0.8)] hover:bg-[#0f52c4]"
            >
              {live ? "View AI Activity" : assistant === "almost" ? (firstListing ? "Open Your Listing" : "Add a Property") : "See Plans, from ₱499 a Month"}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>

        <Panel
          className="xl:col-span-2"
          icon={<Zap className="size-5 fill-[#fbbf24] text-[#fbbf24]" aria-hidden />}
          title={showAi ? "AI Agent Activity" : "Recent Activity"}
          action={showAi ? { href: "/app/agents", label: "View All" } : undefined}
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
                        <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-white", tone)}>
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
          <section aria-labelledby="perf-title" className="rounded-[1.5rem] border border-line bg-white p-5 shadow-[var(--shadow-card)] xl:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-6 text-grape-600" strokeWidth={3} aria-hidden />
                <h2 id="perf-title" className="text-lg font-extrabold tracking-tight">
                  Property Performance
                </h2>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="rounded-full border border-line px-3 py-1 font-semibold">Last 30 Days</span>
                <Link href="/app/reports" className="font-bold text-grape-700 hover:underline">
                  Full reports
                </Link>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
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

        <Panel className={performance ? "xl:col-span-2" : "xl:col-span-5"} icon={<Rocket className="size-5" aria-hidden />} title="Quick Actions">
          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2.5 p-3.5">
            <Action href="/app/pricing" icon={PhilippinePeso} tone="from-[#1a4bb0] to-[#0c2563]" label="Pricing Advisor" note={pricingAdvisor ? undefined : "Agency plan"} />
            <Action
              href={canCreateProperty ? "/app/properties/new" : "/app/properties"}
              icon={canCreateProperty ? Plus : Home}
              tone="from-[#0e97a9] to-[#0a7183]"
              label={canCreateProperty ? "Add a Property" : "Open Properties"}
            />
            <Action icon={Video} tone="from-[#2f7af5] to-[#1a5fe0]" label="Video Ad Maker" note="Coming soon" />
            <Action
              href={facebookConnected ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/integrations"}
              icon={Megaphone}
              tone="from-[#12a356] to-[#0b7a3f]"
              label={facebookConnected ? "Post Listing on Facebook" : "Connect Your Facebook Page"}
            />
            <Action
              href={performance ? "/app/reports" : "/app/pipeline"}
              icon={BarChart3}
              tone="from-[#7c4ff0] to-[#5a31c7]"
              label={performance ? "View Detailed Reports" : "Open Your Leads"}
            />
            <Action icon={Headset} tone="from-[#e58a0b] to-[#bd6304]" label="Contact Our Support Team" note="Coming soon" />
          </div>
        </Panel>
      </div>

      {/* The banner from the mockup */}
      <section
        style={{ "--i": 4 } as React.CSSProperties}
        className="relative isolate flex flex-wrap items-center justify-between gap-x-6 gap-y-4 overflow-hidden rounded-[1.5rem] border border-line p-5 sm:px-6 sm:py-7"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/skyline.webp" alt="" width={2000} height={481} loading="lazy" className="absolute inset-0 -z-20 size-full object-cover object-[100%_10%]" />
        {/* A wash in the card's color keeps the words readable in both themes; the skyline shows through on the right. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--pp-card)] from-25% via-[var(--pp-card)]/75 via-55% to-transparent max-sm:from-0% max-sm:via-[var(--pp-card)]/85 max-sm:to-[var(--pp-card)]/55"
        />
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight italic sm:text-[1.5rem]">Turn Your Property into Profit!</h2>
          <p className="mt-1 max-w-xl text-sm text-ink/80">
            {paid
              ? "Share a listing's public page on Facebook and Messenger. Every inquiry becomes a lead, ready to follow up."
              : "With MyHomeSeller on Basic, every buyer gets an answer and you see which leads fit each listing."}
          </p>
        </div>
        <Link
          href={paid ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/billing"}
          className="pp-bounce inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-sun px-6 text-sm font-extrabold text-sun-ink shadow-[0_10px_22px_-10px_rgb(248_196_35/0.9)] hover:brightness-105 max-sm:w-full"
        >
          {paid ? (firstListing ? "Share a Listing" : "Add a Property") : "See Plans, from ₱499 a Month"}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </section>

      {/* Setup while it's unfinished, and recent activity when the panel above shows the AI instead */}
      {!setupDone || showAi ? (
        <div style={{ "--i": 5 } as React.CSSProperties} className={cx("grid grid-cols-1 gap-5", !setupDone && showAi && "lg:grid-cols-2")}>
          {!setupDone ? (
            <section className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <Icon3d name="rocket" size={44} />
                <div className="flex-1">
                  <h2 className="text-xl font-extrabold tracking-tight">Get Set Up</h2>
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
                <h2 className="text-xl font-extrabold tracking-tight">Recent Activity</h2>
              </div>
              <ActivityList recent={recent} now={now} />
            </section>
          ) : null}
        </div>
      ) : null}
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
  chevron = false,
}: {
  icon: LucideIcon;
  circle: string;
  tile: string;
  label: string;
  value: ReactNode;
  trend?: number | null;
  note: ReactNode;
  href?: string;
  /** Show the arrow on the right, as on the first and last cards. */
  chevron?: boolean;
}) {
  const className = cx("flex flex-col gap-2.5 rounded-[var(--radius-tile)] p-3.5 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4", tile, href && "pp-lift");
  const body = (
    <>
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.45)] sm:size-12", circle)}>
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink/80">{label}</span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[1.75rem] leading-none font-extrabold tracking-tight sm:text-[2rem]">{value}</span>
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
      {href && chevron ? <ChevronRight className="size-5 shrink-0 text-ink/60 max-sm:hidden" aria-hidden /> : null}
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
      <div className="flex items-center justify-between gap-3 bg-frame-1 px-5 py-3 text-white">
        <h2 className="flex items-center gap-2.5 text-base font-extrabold tracking-tight">
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
    <span className="flex items-start gap-3 py-2.5">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold">{title}</span>
        <span className="block truncate text-[13px] text-muted">{detail}</span>
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
                <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", a.tone)}>
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

/** A colored shortcut tile. Without `href` it's something that isn't ready yet, so it can't be pressed. */
function Action({ href, icon: Icon, tone, label, note }: { href?: string; icon: LucideIcon; tone: string; label: string; note?: string }) {
  const className = cx(
    "flex min-h-16 flex-col justify-center gap-2 rounded-2xl bg-gradient-to-br p-3.5 text-sm leading-tight font-bold text-white sm:flex-row sm:items-center sm:justify-start sm:gap-3",
    tone,
    href ? "pp-lift pp-bounce" : "cursor-default",
  );
  const body = (
    <>
      <Icon className="size-6 shrink-0" aria-hidden />
      <span className="min-w-0">
        {label}
        {note ? <span className="mt-0.5 block text-xs font-semibold text-white/85">{note}</span> : null}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className} aria-disabled="true">
      {body}
    </div>
  );
}
