import Link from "next/link";
import {
  Building2,
  CircleCheck,
  Flame,
  MessageCircle,
  Plus,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Alert, buttonClass, cx } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/property-labels";
import { fmtDuration, type LeadsReport } from "@/lib/reports";
import { SourceChart } from "./reports/reports-view";

export type Activity = { at: string; icon: LucideIcon; tone: string; title: string; detail: string; href?: string };
export type ListingRow = { id: string; name: string; location: string; price_minor: number; currency: string; status: string; coverUrl?: string | null };
export type ReportSummary = {
  leads: LeadsReport;
  topListings: Array<{ id: string; name: string; viewingRequests: number; questions: number; saves: number }>;
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
  properties: ListingRow[];
  availableCount: number;
  reservedCount: number;
  inventoryValue: number;
  steps: SetupStep[];
  recent: Activity[];
  leads: { newCount: number; openCount: number } | null;
  publicCount: number;
  /** New Messenger chats in the last 30 days and how many need the team; null when this role can't see chats. */
  messenger: { count: number; waiting: number } | null;
  /** Last 30 days at a glance; null for roles that can't see reports. */
  summary: ReportSummary | null;
  pagesConnected: boolean;
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
  properties,
  availableCount,
  reservedCount,
  inventoryValue,
  steps,
  recent,
  leads,
  publicCount,
  messenger,
  summary,
  pagesConnected,
  assistantLive,
  now,
}: DashboardData) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="pp-stagger space-y-8">
      {/* Greeting */}
      <header style={{ "--i": 0 } as React.CSSProperties} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{dateText}</p>
          <h1 className="mt-1 text-[2.25rem] leading-tight font-bold tracking-tight sm:text-[2.6rem]">
            {greetingText}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-muted">Here&apos;s where {businessName} stands today.</p>
        </div>
        {canCreateProperty ? (
          <Link
            href="/app/properties/new"
            className={buttonClass("primary")}
          >
            <Plus className="size-4" aria-hidden /> Add property
          </Link>
        ) : null}
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/* Headline numbers */}
      <section style={{ "--i": 1 } as React.CSSProperties} aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={Building2} tint="bg-brand-50 text-brand-600" label="Active listings" value={<CountUp value={properties.length} />}
          note={properties.length ? `${availableCount} available, ${reservedCount} reserved` : "No listings yet"} />
        <Stat icon={Wallet} tint="bg-brand-50 text-good" label="Available inventory" value={<CountUp value={inventoryValue} peso />}
          note={availableCount ? `Across ${availableCount} available listing${availableCount === 1 ? "" : "s"}` : "Total price of available listings"} />
        {leads ? (
          <Stat icon={Flame} tint="bg-hot-50 text-hot" label="New viewing requests" value={<CountUp value={leads.newCount} />}
            note={leads.openCount ? `${leads.openCount} open viewing requests` : publicCount ? "Waiting for buyers" : "Show a listing to buyers to start"}
            href="/app/leads" />
        ) : (
          <Stat icon={Flame} tint="bg-hot-50 text-hot" label="Listings shown to buyers" value={<CountUp value={publicCount} />} note="Visible on Home Finder" />
        )}
        {messenger && (pagesConnected || messenger.count > 0) ? (
          <Stat icon={MessageCircle} tint="bg-brass-50 text-brass" label="Messenger inquiries" value={<CountUp value={messenger.count} />} href="/app/inbox"
            note={messenger.waiting ? `${messenger.waiting} waiting for your reply` : "New chats in the last 30 days"} />
        ) : messenger ? (
          <Stat icon={MessageCircle} tint="bg-brass-50 text-brass" label="Messenger inquiries" value="—" note="Starts when Facebook is connected" muted href="/app/integrations" />
        ) : (
          <Stat icon={MessageCircle} tint="bg-brass-50 text-brass" label="Messenger" value={pagesConnected ? "On" : "—"} note={pagesConnected ? "Your Facebook Page is connected" : "Not connected yet"} muted={!pagesConnected} />
        )}
      </section>

      {summary ? <ReportSummaryCard summary={summary} /> : null}

      <div style={{ "--i": 3 } as React.CSSProperties} className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Assistant status */}
        <section className="rounded-2xl bg-brand-900 p-6 text-white sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Your AI assistant</h2>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <span className={cx("size-2 rounded-full", assistantLive ? "bg-[#8fd1a6]" : "bg-[#e0b86a]")} aria-hidden />
              {assistantLive ? "Live for Home Finder buyers" : "Not live yet"}
            </span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">
            It already answers Home Finder buyers on listings you choose to show. Once your Facebook Page is connected,
            it will answer Messenger inquiries too, day and night.
          </p>

          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Setup</span>
              <span className="tabular-nums text-white/70">
                {doneCount} of {steps.length} done
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
              <div className="pp-grow h-full rounded-full bg-[#c9a463]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-5 space-y-1">
              {steps.map((s) => {
                const row = (
                  <span className="flex items-center gap-3 py-1.5 text-sm">
                    {s.done ? (
                      <CircleCheck className="size-5 shrink-0 text-[#c9a463]" aria-hidden />
                    ) : (
                      <span className="size-5 shrink-0 rounded-full border-2 border-white/25" aria-hidden />
                    )}
                    <span className={cx("flex-1", s.done && "text-white/55")}>{s.label}</span>
                    {s.soon ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/60">Coming soon</span> : null}
                    <span className="sr-only">{s.done ? "Done" : "Not done"}</span>
                  </span>
                );
                return (
                  <li key={s.label}>
                    {!s.done && s.href ? (
                      <Link href={s.href} className="block rounded-md hover:bg-white/[0.06]">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Recent activity */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-2xl font-bold tracking-tight">Recent activity</h2>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Nothing yet. Activity from your team and listings shows up here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {recent.map((a, i) => {
                const Icon = a.icon;
                const body = (
                  <span className="flex items-start gap-3 py-3">
                    <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", a.tone)}>
                      <Icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.title}</span>
                      <span className="block truncate text-sm text-muted">{a.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(a.at, now)}</span>
                  </span>
                );
                return <li key={`${a.title}-${a.at}-${i}`}>{a.href ? <Link href={a.href} className="block hover:bg-surface">{body}</Link> : body}</li>;
              })}
            </ul>
          )}
        </section>
      </div>

      <div style={{ "--i": 4 } as React.CSSProperties} className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Listings snapshot */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Your listings</h2>
            {properties.length ? (
              <Link href="/app/properties" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                View all
              </Link>
            ) : null}
          </div>
          {properties.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line px-6 py-10 text-center">
              <Building2 className="mx-auto size-8 text-muted" aria-hidden />
              <p className="mt-3 font-medium">No listings yet</p>
              <p className="mt-1 text-sm text-muted">The assistant only talks about properties you add here.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {properties.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <Link href={`/app/properties/${p.id}`} className="-mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-surface">
                    {p.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail
                      <img src={p.coverUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-sm text-muted">{p.location}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{formatPeso(Number(p.price_minor), p.currency)}</span>
                      <span className={cx("block text-xs", p.status === "available" ? "text-good" : "text-muted")}>
                        {STATUS_LABEL[p.status as keyof typeof STATUS_LABEL]}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 className="text-2xl font-bold tracking-tight">Quick actions</h2>
          <div className="mt-4 grid gap-3">
            {canCreateProperty ? (
              <QuickAction href="/app/properties/new" icon={Plus} title="Add a property" text="Price, location and financing" />
            ) : null}
            {canManageTeam ? <QuickAction href="/app/team" icon={UserPlus} title="Invite a teammate" text="Agents, admins or marketing" /> : null}
            <QuickAction href="/app/integrations" icon={MessageCircle} title="Facebook Pages" text="Import posts as listings, post listings to your Page" />
          </div>
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
    <section style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="summary-title" className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="summary-title" className="text-2xl font-bold tracking-tight">Last 30 days</h2>
          <p className="mt-0.5 text-sm text-muted">How buyers found you and what happened next.</p>
        </div>
        <Link href="/app/reports" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          Full reports
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Figure label="Inquiries" value={leads.inquiries} note={`${leads.fromProPilot} Home Finder, ${leads.fromMessenger} Messenger`} />
        <Figure label="Viewing requests" value={leads.viewingRequests} note={leads.viewingRequests ? `${leads.reachedViewing} reached a viewing${reachedPct !== null ? ` (${reachedPct}%)` : ""}` : "None yet"} />
        <Figure label="Closed" value={leads.closed} note={leads.closed ? "Marked closed in this period" : "No closed deals yet"} />
        <Figure label="Typical first reply" value={fmtDuration(leads.medianFirstResponseMs)} note="To viewing requests" />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div>
          {leads.inquiries ? (
            <SourceChart series={leads.series} />
          ) : (
            <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
              No inquiries in the last 30 days. Show a listing to buyers or connect Facebook to start.
            </p>
          )}
        </div>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">Most interest</h3>
            {topListings.length ? (
              <ol className="mt-2 divide-y divide-line">
                {topListings.map((l) => (
                  <li key={l.id}>
                    <Link href={`/app/properties/${l.id}`} className="-mx-2 block rounded-lg px-2 py-2 hover:bg-surface">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="block text-xs text-muted tabular-nums">
                        {plural(l.viewingRequests, "viewing request")}, {plural(l.questions, "question")}, {plural(l.saves, "save")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted">No saves, questions or viewing requests on your listings yet.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI chat</h3>
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
      <dd className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{typeof value === "number" ? <CountUp value={value} /> : value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{note}</dd>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Stat({ icon: Icon, tint, label, value, note, muted, href }: { icon: LucideIcon; tint: string; label: string; value: ReactNode; note: string; muted?: boolean; href?: string }) {
  const className = cx("block rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5", href && "pp-lift hover:border-brand-600");
  const body = (
    <>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl sm:size-10", tint)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="text-[13px] font-medium leading-tight text-muted sm:text-sm">{label}</p>
      </div>
      <p className={cx("mt-3 text-[1.6rem] leading-none font-bold tracking-tight tabular-nums sm:mt-4 sm:text-[2.1rem]", muted && "text-slate-300")}>{value}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
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

function QuickAction({ href, icon: Icon, title, text, soon }: { href?: string; icon: LucideIcon; title: string; text: string; soon?: boolean }) {
  const inner = (
    <>
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-lg", soon ? "bg-slate-100 text-zinc-500" : "bg-brand-50 text-brand-600")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-sm font-semibold", soon && "text-slate-500")}>{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      {soon ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Soon</span> : null}
    </>
  );
  if (soon || !href) {
    return <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-3" aria-disabled="true">{inner}</div>;
  }
  return (
    <Link href={href} className="pp-lift flex items-center gap-3 rounded-xl border border-line px-3 py-3 hover:border-brand-600">
      {inner}
    </Link>
  );
}
