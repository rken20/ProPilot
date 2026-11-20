import Link from "next/link";
import { CircleCheck, Plus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { InstallBanner } from "@/components/install-app";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/property-labels";
import { fmtDuration, type LeadsReport } from "@/lib/reports";
import { SourceChart } from "./reports/reports-view";

export type Activity = { at: string; icon: LucideIcon; tone: string; title: string; detail: string; href?: string };
export type ListingRow = { id: string; name: string; location: string; price_minor: number; currency: string; status: string; is_public: boolean; coverUrl?: string | null };
export type ReportSummary = {
  leads: LeadsReport;
  topListings: Array<{ id: string; name: string; views: number; inquiries: number }>;
  chats: { conversations: number; aiOnly: number; afterHoursAnswered: number };
};
export type SetupStep = { label: string; done: boolean; href?: string; soon?: boolean };

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
  /** Buyer Finder this month; null on Free or for roles that don't work leads. */
  finder: { used: number; limit: number | null } | null;
  /** Leads past the first inquiry (qualified, viewing, offer, reservation); null if this role can't see leads. */
  interested: number | null;
  /** Public listing page views, last 30 days. */
  views: number;
  /** New leads in the last 30 days, and how many came from Messenger; null if this role can't see leads. */
  inquiries: { total: number; messenger: number } | null;
  /** Last 30 days at a glance; null for roles that can't see reports. */
  summary: ReportSummary | null;
  assistantLive: boolean;
  now?: Date;
};

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
  finder,
  interested,
  views,
  inquiries,
  summary,
  assistantLive,
  now,
}: DashboardData) {
  const doneCount = steps.filter((s) => s.done).length;
  const paid = plan.code !== "free";
  const firstListing = properties.find((p) => p.status === "available") ?? properties[0];
  return (
    <div className="pp-stagger space-y-8">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <InstallBanner />

      {/* Hero: the promise, and the assistant's state */}
      <section
        style={{ "--i": 0 } as React.CSSProperties}
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-frame-1 via-frame-2 to-frame-3 p-6 text-white shadow-[var(--shadow-lift)] sm:p-8"
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/70">
              {dateText} · {greetingText}
              {firstName ? `, ${firstName}` : ""}
            </p>
            <h1 className="mt-2 max-w-xl text-[2rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-[2.6rem]">
              Find the right buyer for your property.
            </h1>
            <p className="mt-2 max-w-lg text-[15px] text-white/75">
              Your AI-powered sales assistant answers inquiries, sizes up each lead and finds potential buyers for {businessName}.
            </p>
          </div>
          <Icon3d name="house" size={112} className="hidden sm:block" />
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-4 rounded-[1.5rem] bg-white/12 p-4 ring-1 ring-white/15 backdrop-blur-sm">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white">
            <Icon3d name="robot" size={40} />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/80">
              Your AI assistant
              <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide", assistantLive ? "bg-brand-600 text-white" : "bg-white/15 text-white/80")}>
                {assistantLive ? "ACTIVE" : paid ? "ALMOST READY" : "OFF ON FREE"}
              </span>
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {assistantLive ? "Let's find your buyer!" : paid ? "Make a listing public to switch it on." : "Upgrade to Basic to switch on the AI."}
            </p>
          </div>
          {canCreateProperty ? (
            <Link href="/app/properties/new" className={buttonClass("inverse", "w-full sm:w-auto")}>
              <Plus className="size-4" aria-hidden /> Add property
            </Link>
          ) : null}
        </div>
      </section>

      {/* Key numbers */}
      <section style={{ "--i": 1 } as React.CSSProperties} aria-labelledby="numbers-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="numbers-title" className="text-xl font-extrabold tracking-tight">
            Your property dashboard
          </h2>
          <Link
            href="/app/billing"
            className="rounded-full bg-tile-mint px-3 py-1 text-xs font-bold text-brand-700 hover:ring-2 hover:ring-brand-100"
          >
            {plan.name.toUpperCase()} {paid ? `· ${formatPeso(plan.priceMinor)} / month` : "· upgrade for AI"}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Tile
            icon="target"
            tile="bg-tile-lavender"
            accent="text-grape-700"
            label="Potential buyers found"
            value={finder ? (finder.limit === null ? <CountUp value={finder.used} /> : <>{finder.used} / {finder.limit}</>) : "—"}
            note={finder ? "This month, by Buyer Finder" : "Buyer Finder is on paid plans"}
            href={finder ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties") : "/app/billing"}
          />
          <Tile
            icon="heart"
            tile="bg-tile-mint"
            accent="text-brand-700"
            label="Interested buyers"
            value={interested === null ? "—" : <CountUp value={interested} />}
            note="Qualified, viewing or making an offer"
            href="/app/pipeline"
          />
          <Tile icon="eyes" tile="bg-tile-sky" accent="text-tile-sky-ink" label="Property views" value={<CountUp value={views} />} note="Public listing pages, last 30 days" />
          <Tile
            icon="envelope"
            tile="bg-tile-peach"
            accent="text-brass-700"
            label="Buyer inquiries"
            value={inquiries ? <CountUp value={inquiries.total} /> : "—"}
            note={inquiries ? (inquiries.messenger ? `Last 30 days, ${inquiries.messenger} on Messenger` : "New leads, last 30 days") : "Leads are for sales roles"}
            href={inquiries ? "/app/pipeline" : undefined}
          />
        </div>
      </section>

      {/* Buyer Finder */}
      <section
        style={{ "--i": 2 } as React.CSSProperties}
        className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
        aria-labelledby="finder-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="finder-title" className="text-xl font-extrabold tracking-tight">
              Your Buyer Finder
            </h2>
            <p className="mt-1 text-[1.75rem] leading-tight font-extrabold tracking-tight text-brand-600 sm:text-[2rem]">
              {finder ? (finder.limit === null ? "Unlimited buyer matches" : `${finder.limit} buyer matches / month`) : "Find buyers with AI"}
            </p>
          </div>
          <Icon3d name="target" size={56} />
        </div>
        {finder && finder.limit !== null ? (
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-grape-50"
            role="progressbar"
            aria-label="Buyer Finder this month"
            aria-valuemin={0}
            aria-valuemax={finder.limit}
            aria-valuenow={finder.used}
          >
            <div className="pp-grow h-full rounded-full bg-gradient-to-r from-brand-600 to-[#3ccf83]" style={{ width: `${Math.min(100, (finder.used / Math.max(1, finder.limit)) * 100)}%` }} />
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {finder
            ? `Your monthly ${plan.name} plan allowance. The AI reads every chat and inquiry for budget and area, then shows who fits each listing.`
            : "On Basic, the AI reads every chat and inquiry for budget and area, then shows which of your leads fit each listing."}
        </p>
        <Link
          href={finder ? (firstListing ? `/app/properties/${firstListing.id}` : "/app/properties/new") : "/app/billing"}
          className={buttonClass("primary", "mt-5 w-full py-3 text-base")}
        >
          {finder ? (firstListing ? "Find potential buyers" : "Add a property to start") : "See plans, from ₱499 a month"} <span aria-hidden>→</span>
        </Link>
      </section>

      {/* Listings */}
      <section style={{ "--i": 3 } as React.CSSProperties} aria-labelledby="listings-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="listings-title" className="text-xl font-extrabold tracking-tight">
            My property listings
          </h2>
          {properties.length ? (
            <Link href="/app/properties" className="text-sm font-bold text-grape-700 hover:underline">
              View all
            </Link>
          ) : null}
        </div>
        {properties.length === 0 ? (
          <div className="rounded-[1.5rem] border-2 border-dashed border-grape-100 bg-white px-6 py-10 text-center">
            <Icon3d name="houses" size={72} className="mx-auto" />
            <p className="mt-3 text-lg font-bold">No listings yet</p>
            <p className="mt-1 text-sm text-muted">Add your first property. The AI only talks about what you add here.</p>
            {canCreateProperty ? (
              <Link href="/app/properties/new" className={buttonClass("primary", "mt-4")}>
                <Plus className="size-4" aria-hidden /> Add property
              </Link>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {properties.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/properties/${p.id}`}
                  className="pp-lift block overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]"
                >
                  <div className="relative">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail
                      <img src={p.coverUrl} alt="" className="aspect-[16/10] w-full object-cover" />
                    ) : (
                      <div className="grid aspect-[16/10] place-items-center bg-gradient-to-br from-tile-lavender to-tile-sky">
                        <Icon3d name="houses" size={64} />
                      </div>
                    )}
                    <span
                      className={cx(
                        "absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-xs font-bold",
                        p.status === "available" ? "bg-tile-mint text-brand-700" : "bg-white/90 text-muted",
                      )}
                    >
                      {p.status === "available" ? "Active" : STATUS_LABEL[p.status as keyof typeof STATUS_LABEL]}
                    </span>
                    {p.is_public ? (
                      <span className="absolute right-3 top-3 rounded-full bg-grape-900/75 px-2.5 py-0.5 text-xs font-semibold text-white">Public page</span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="truncate text-sm text-muted">{p.location}</p>
                    <p className="mt-2 text-lg font-extrabold text-grape-700 tabular-nums">{formatPeso(Number(p.price_minor), p.currency)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {summary ? <ReportSummaryCard summary={summary} /> : null}

      <div style={{ "--i": 5 } as React.CSSProperties} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Setup */}
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

        {/* Recent activity */}
        <section className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <Icon3d name="bell" size={44} />
            <h2 className="text-xl font-extrabold tracking-tight">Recent activity</h2>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing yet. Activity from your team and listings shows up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((a, i) => {
                const Icon = a.icon;
                const body = (
                  <span className="flex items-start gap-3 py-3">
                    <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", a.tone)}>
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{a.title}</span>
                      <span className="block truncate text-sm text-muted">{a.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(a.at, now)}</span>
                  </span>
                );
                return (
                  <li key={`${a.title}-${a.at}-${i}`}>
                    {a.href ? (
                      <Link href={a.href} className="-mx-2 block rounded-xl px-2 hover:bg-grape-50">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The last 30 days in one card: lead numbers, the inquiries chart, top listings and the AI chat. */
function ReportSummaryCard({ summary }: { summary: ReportSummary }) {
  const { leads, topListings, chats } = summary;
  const reachedPct = leads.viewingRequests ? Math.round((leads.reachedViewing / leads.viewingRequests) * 100) : null;
  return (
    <section
      style={{ "--i": 4 } as React.CSSProperties}
      aria-labelledby="summary-title"
      className="rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon3d name="chart" size={44} />
          <div>
            <h2 id="summary-title" className="text-xl font-extrabold tracking-tight">
              Last 30 days
            </h2>
            <p className="text-sm text-muted">How buyers found you and what happened next.</p>
          </div>
        </div>
        <Link href="/app/reports" className="text-sm font-bold text-grape-700 hover:underline">
          Full reports
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Figure label="Inquiries" value={leads.inquiries} note={`${leads.viewingRequests} from listing pages, ${leads.fromMessenger} Messenger`} />
        <Figure
          label="Reached a viewing"
          value={leads.reachedViewing}
          note={leads.viewingRequests ? `${reachedPct}% of listing inquiries` : "None yet"}
        />
        <Figure label="Closed" value={leads.closed} note={leads.closed ? "Marked closed in this period" : "No closed deals yet"} />
        <Figure label="Typical first reply" value={fmtDuration(leads.medianFirstResponseMs)} note="To listing inquiries" />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          {leads.inquiries ? (
            <SourceChart series={leads.series} />
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-grape-100 px-4 py-10 text-center text-sm text-muted">
              No inquiries in the last 30 days. Share a listing&apos;s public page or connect Facebook to start.
            </p>
          )}
        </div>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-bold">Most interest</h3>
            {topListings.length ? (
              <ol className="mt-2 divide-y divide-line">
                {topListings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/app/properties/${l.id}`} className="-mx-2 block rounded-xl px-2 py-2 hover:bg-grape-50">
                      <span className="block truncate text-sm font-semibold">{l.name}</span>
                      <span className="block text-xs text-muted tabular-nums">
                        {plural(l.views, "view")}, {plural(l.inquiries, "inquiry", "inquiries")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted">No views or inquiries on your public pages yet.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold">AI chat</h3>
            <p className="mt-1 text-sm text-muted">
              {chats.conversations
                ? `${plural(chats.conversations, "chat")}, ${chats.aiOnly} handled by the AI alone, ${plural(chats.afterHoursAnswered, "message")} answered after hours.`
                : "No chats yet."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, note }: { label: string; value: number | string; note: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{typeof value === "number" ? <CountUp value={value} /> : value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

function Tile({
  icon,
  tile,
  accent,
  label,
  value,
  note,
  href,
}: {
  icon: Icon3dName;
  tile: string;
  accent: string;
  label: string;
  value: ReactNode;
  note: string;
  href?: string;
}) {
  const className = cx("pp-bounce block rounded-[var(--radius-tile)] p-4 sm:p-5", tile, href && "pp-lift");
  const body = (
    <>
      <Icon3d name={icon} size={40} />
      <p className={cx("mt-3 text-[1.9rem] leading-none font-extrabold tracking-tight tabular-nums sm:text-[2.3rem]", accent)}>{value}</p>
      <p className="mt-2 text-sm font-semibold text-ink/80">{label}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
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
