import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, MessageCircle, Plus, Smartphone, UserRound, CalendarDays, Hand } from "lucide-react";
import { can } from "@propilot/shared";
import { PageHeader, buttonClass, cx } from "@/components/ui";
import { DEFAULT_AGENT_SETTINGS } from "@/lib/agent-info";
import { getUser, requireBusiness } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { daysSince, isQuiet, OPEN_STAGES, STAGE_INFO, type Stage } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

type Row = {
  id: string;
  name: string | null;
  kind: string;
  source: string;
  stage: Stage;
  property_id: string | null;
  assigned_to: string | null;
  deal_value_minor: number | null;
  next_step: string | null;
  next_step_at: string | null;
  last_activity_at: string;
  closed_at: string | null;
  lost_reason: string | null;
};

const SOURCE_ICON = { viewing_request: CalendarDays, messenger: MessageCircle, app_chat: Smartphone, manual: Hand } as const;
const SOURCE_SHORT: Record<string, string> = { viewing_request: "Request", messenger: "Messenger", app_chat: "ProPilot chat", manual: "Added" };

const VIEWS = [
  ["open", "Open"],
  ["won", "Won"],
  ["lost", "Lost"],
] as const;

function initials(name: string | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function PipelinePage({ searchParams }: PageProps<"/app/pipeline">) {
  const [biz, me] = await Promise.all([requireBusiness(), getUser()]);
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned")) redirect("/app");
  const sp = await searchParams;
  const view = VIEWS.some(([k]) => k === sp.view) ? (sp.view as "open" | "won" | "lost") : "open";
  const mine = sp.mine === "1";

  const supabase = await createClient();
  let q = supabase
    .from("prospects")
    .select("id, name, kind, source, stage, property_id, assigned_to, deal_value_minor, next_step, next_step_at, last_activity_at, closed_at, lost_reason")
    .eq("business_id", biz.businessId)
    .order("last_activity_at", { ascending: false })
    .limit(500);
  q = view === "open" ? q.in("stage", [...OPEN_STAGES]) : q.eq("stage", view);
  if (mine && me) q = q.eq("assigned_to", me.id);
  const [{ data }, { data: settings }, { count: waiting }] = await Promise.all([
    q,
    supabase.from("agent_settings").select("follow_up_days").eq("business_id", biz.businessId).maybeSingle(),
    supabase.from("agent_tasks").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("status", "proposed"),
  ]);
  const rows = (data ?? []) as Row[];
  const followUpDays = settings?.follow_up_days ?? DEFAULT_AGENT_SETTINGS.follow_up_days;

  const propIds = [...new Set(rows.map((r) => r.property_id).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.assigned_to).filter((x): x is string => !!x))];
  const [{ data: props }, { data: people }] = await Promise.all([
    propIds.length ? supabase.from("properties").select("id, name").in("id", propIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  const propName = new Map((props ?? []).map((p) => [p.id, p.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const now = new Date();

  const openValue = rows.reduce((s, r) => s + (r.deal_value_minor ?? 0), 0);
  const quietCount = view === "open" ? rows.filter((r) => isQuiet(r, followUpDays, now)).length : 0;
  const href = (v: string, m: boolean) => {
    const p = new URLSearchParams();
    if (v !== "open") p.set("view", v);
    if (m) p.set("mine", "1");
    const s = p.toString();
    return s ? `/app/pipeline?${s}` : "/app/pipeline";
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Everyone you're selling to, from first inquiry to closing. New leads from viewing requests and chats appear here on their own."
        action={
          <Link href="/app/pipeline/new" className={buttonClass()}>
            <Plus className="size-4" aria-hidden /> Add lead
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1" aria-label="Pipeline view">
          {VIEWS.map(([k, label]) => (
            <Link
              key={k}
              href={href(k, mine)}
              aria-current={view === k ? "page" : undefined}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                view === k ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </Link>
          ))}
          <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
          <Link
            href={href(view, !mine)}
            aria-pressed={mine}
            className={cx("rounded-lg px-3 py-1.5 text-sm", mine ? "bg-white font-semibold text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink")}
          >
            Only mine
          </Link>
        </nav>
        <p className="text-sm text-muted">
          {rows.length} {view === "open" ? "open" : view} {rows.length === 1 ? "lead" : "leads"}
          {openValue ? <> · {formatPeso(openValue)} in deals</> : null}
          {quietCount ? (
            <>
              {" "}
              · <span className="font-medium text-hot">{quietCount} quiet</span>
            </>
          ) : null}
          {waiting ? (
            <>
              {" "}
              ·{" "}
              <Link href="/app/agents" className="font-medium text-brand-600 hover:text-brand-700">
                {waiting} AI {waiting === 1 ? "suggestion" : "suggestions"} waiting
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {view === "open" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1060px] grid-cols-5 gap-3">
            {OPEN_STAGES.map((stage) => {
              const col = rows.filter((r) => r.stage === stage);
              const value = col.reduce((s, r) => s + (r.deal_value_minor ?? 0), 0);
              return (
                <section key={stage} aria-labelledby={`col-${stage}`} className="flex min-h-64 flex-col rounded-2xl bg-zinc-100/70 p-2">
                  <header className="px-2 pt-1.5 pb-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 id={`col-${stage}`} className="text-sm font-semibold">
                        {STAGE_INFO[stage].label}
                      </h2>
                      <span className="text-xs tabular-nums text-muted">{col.length}</span>
                    </div>
                    <p className="text-xs text-muted">{value ? formatPeso(value) : STAGE_INFO[stage].help}</p>
                  </header>
                  <ul className="flex flex-1 flex-col gap-2">
                    {col.map((r) => {
                      const Icon = SOURCE_ICON[r.source as keyof typeof SOURCE_ICON] ?? Hand;
                      const quiet = isQuiet(r, followUpDays, now);
                      const due = r.next_step_at && new Date(r.next_step_at) <= now;
                      return (
                        <li key={r.id}>
                          <Link
                            href={`/app/pipeline/${r.id}`}
                            className="pp-lift block rounded-xl border border-line bg-white p-3 shadow-[0_1px_2px_rgb(28_26_23/0.04)] hover:border-zinc-300"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 truncate text-sm font-semibold">{r.name || "Unnamed lead"}</p>
                              {r.assigned_to ? (
                                <span
                                  className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700"
                                  title={`Assigned to ${personName.get(r.assigned_to) ?? "a teammate"}`}
                                >
                                  {initials(personName.get(r.assigned_to))}
                                </span>
                              ) : null}
                            </div>
                            {r.property_id && propName.get(r.property_id) ? (
                              <p className="mt-0.5 truncate text-xs text-muted">{propName.get(r.property_id)}</p>
                            ) : null}
                            {r.deal_value_minor ? <p className="mt-1 text-xs font-medium tabular-nums">{formatPeso(r.deal_value_minor)}</p> : null}
                            {due ? (
                              <p className="mt-2 truncate rounded-md bg-brass-50 px-2 py-1 text-xs text-[#7d5f26]">Due: {r.next_step || "next step"}</p>
                            ) : null}
                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
                              <span className="flex items-center gap-1">
                                <Icon className="size-3.5" aria-hidden /> {SOURCE_SHORT[r.source] ?? "Lead"}
                              </span>
                              <span className={cx("flex items-center gap-1", quiet && "font-medium text-hot")}>
                                <Clock className="size-3.5" aria-hidden />
                                {quiet ? `Quiet ${daysSince(r.last_activity_at, now)}d` : timeAgo(r.last_activity_at, now)}
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                    {!col.length ? <li className="px-2 py-6 text-center text-xs text-muted">No one here yet</li> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : rows.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/app/pipeline/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50">
                <div className="min-w-0">
                  <p className="font-semibold">{r.name || "Unnamed lead"}</p>
                  <p className="text-sm text-muted">
                    {(r.property_id && propName.get(r.property_id)) || "No listing linked"}
                    {view === "lost" && r.lost_reason ? ` · ${r.lost_reason}` : ""}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {r.deal_value_minor ? <p className="font-medium tabular-nums">{formatPeso(r.deal_value_minor)}</p> : null}
                  <p className="text-xs text-muted">{r.closed_at ? `Closed ${timeAgo(r.closed_at, now)}` : ""}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <UserRound className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-semibold">{view === "won" ? "No closed deals yet" : "No lost leads"}</p>
          <p className="mt-1 text-sm text-muted">
            {view === "won" ? "Move a lead to Won when the sale or lease closes." : "Leads you mark as Lost show up here with the reason."}
          </p>
        </div>
      )}
    </>
  );
}
