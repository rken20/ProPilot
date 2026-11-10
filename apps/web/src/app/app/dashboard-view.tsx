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
import { Alert, cx } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { timeAgo } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/property-labels";

export type Activity = { at: string; icon: LucideIcon; tone: string; title: string; detail: string; href?: string };
export type ListingRow = { id: string; name: string; location: string; price_minor: number; currency: string; status: string; coverUrl?: string | null };
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
  assistantLive,
  now,
}: DashboardData) {
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="space-y-8">
      {/* Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{dateText}</p>
          <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
            {greetingText}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-[15px] text-muted">Here&apos;s where {businessName} stands today.</p>
        </div>
        {canCreateProperty ? (
          <Link
            href="/app/properties/new"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="size-4" aria-hidden /> Add property
          </Link>
        ) : null}
      </header>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {/* Headline numbers */}
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={Building2} tint="bg-brand-50 text-brand-600" label="Active listings" value={String(properties.length)}
          note={properties.length ? `${availableCount} available, ${reservedCount} reserved` : "No listings yet"} />
        <Stat icon={Wallet} tint="bg-emerald-50 text-good" label="Available inventory" value={inventoryValue ? formatPeso(inventoryValue) : "₱0"}
          note={availableCount ? `Across ${availableCount} available listing${availableCount === 1 ? "" : "s"}` : "Total price of available listings"} />
        {leads ? (
          <Stat icon={Flame} tint="bg-orange-50 text-hot" label="New viewing requests" value={String(leads.newCount)}
            note={leads.openCount ? `${leads.openCount} open in Buyer leads` : publicCount ? "Waiting for buyers" : "Show a listing to buyers to start"}
            href="/app/leads" />
        ) : (
          <Stat icon={Flame} tint="bg-orange-50 text-hot" label="Listings shown to buyers" value={String(publicCount)} note="Visible on ProPilot" />
        )}
        <Stat icon={MessageCircle} tint="bg-violet-50 text-violet-600" label="Messenger inquiries" value="—" note="Starts when Facebook is connected" muted />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Assistant status */}
        <section className="rounded-2xl bg-brand-900 p-6 text-white sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Your AI assistant</h2>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <span className={cx("size-2 rounded-full", assistantLive ? "bg-emerald-400" : "bg-amber-400")} aria-hidden />
              {assistantLive ? "Live for ProPilot buyers" : "Not live yet"}
            </span>
          </div>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/70">
            It already answers ProPilot buyers on listings you choose to show. Once your Facebook Page is connected,
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
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-5 space-y-1">
              {steps.map((s) => {
                const row = (
                  <span className="flex items-center gap-3 py-1.5 text-sm">
                    {s.done ? (
                      <CircleCheck className="size-5 shrink-0 text-emerald-400" aria-hidden />
                    ) : (
                      <span className="size-5 shrink-0 rounded-full border-2 border-white/25" aria-hidden />
                    )}
                    <span className={cx("flex-1", s.done && "text-white/55")}>{s.label}</span>
                    {s.soon ? <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">Coming soon</span> : null}
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
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">Recent activity</h2>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* Listings snapshot */}
        <section className="rounded-2xl border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your listings</h2>
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
                  <Link href={`/app/properties/${p.id}`} className="flex items-center gap-4 py-3 hover:bg-surface">
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
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-3">
            {canCreateProperty ? (
              <QuickAction href="/app/properties/new" icon={Plus} title="Add a property" text="Price, location and financing" />
            ) : null}
            {canManageTeam ? <QuickAction href="/app/team" icon={UserPlus} title="Invite a teammate" text="Agents, admins or marketing" /> : null}
            <QuickAction icon={MessageCircle} title="Connect Facebook Page" text="Turns on the Messenger assistant" soon />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, tint, label, value, note, muted, href }: { icon: LucideIcon; tint: string; label: string; value: string; note: string; muted?: boolean; href?: string }) {
  const Wrapper = href ? Link : "div";
  return (
    <Wrapper href={href ?? ""} className={cx("block rounded-2xl border border-line bg-white p-4 sm:p-5", href && "transition-colors hover:border-brand-600")}>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl sm:size-10", tint)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="text-[13px] font-medium leading-tight text-muted sm:text-sm">{label}</p>
      </div>
      <p className={cx("mt-3 text-[22px] font-bold sm:mt-4 sm:text-[28px] leading-none tracking-tight tabular-nums", muted && "text-slate-300")}>{value}</p>
      <p className="mt-2 text-xs text-muted">{note}</p>
    </Wrapper>
  );
}

function QuickAction({ href, icon: Icon, title, text, soon }: { href?: string; icon: LucideIcon; title: string; text: string; soon?: boolean }) {
  const inner = (
    <>
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-lg", soon ? "bg-slate-100 text-slate-400" : "bg-brand-50 text-brand-600")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-sm font-semibold", soon && "text-slate-500")}>{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
      {soon ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">Soon</span> : null}
    </>
  );
  if (soon || !href) {
    return <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-3" aria-disabled="true">{inner}</div>;
  }
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 transition-colors hover:border-brand-600 hover:bg-brand-50/40">
      {inner}
    </Link>
  );
}
