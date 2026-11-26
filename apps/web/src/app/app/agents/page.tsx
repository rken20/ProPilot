import { appSay } from "@/lib/lang-server";
import { redirect } from "next/navigation";
import { CircleDashed, CircleX, Sparkles } from "lucide-react";
import { can } from "@propilot/shared";
import { Card, IconTile, IconTitle, PageHeader, cx } from "@/components/ui";
import { AGENT_INFO, agentName, DEFAULT_AGENT_SETTINGS } from "@/lib/agent-info";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { AgentSettingsForm, RunNow } from "./agent-controls";
import { TaskCard, type TaskRow } from "./task-card";
import { aiEnabled } from "@/lib/plan";

// Running the AI agents by hand can take up to about 40 seconds.
export const maxDuration = 60;

const DECIDED: Record<string, { label: string; tone: string }> = {
  done: { label: "Done", tone: "text-good" },
  dismissed: { label: "Dismissed", tone: "text-muted" },
  failed: { label: "Couldn't send", tone: "text-hot" },
  expired: { label: "Expired", tone: "text-muted" },
  sending: { label: "Sending", tone: "text-muted" },
};

export default async function AgentsPage() {
  const biz = await requireBusiness();
  const say = await appSay();
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned")) redirect("/app");
  const supabase = await createClient();

  const [{ data: waiting }, { data: decided }, { data: runs }, { data: settings }] = await Promise.all([
    supabase
      .from("agent_tasks")
      .select("id, agent, kind, title, reason, draft, prospect_id, conversation_id, proposed_stage, created_at")
      .eq("business_id", biz.businessId)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("agent_tasks")
      .select("id, agent, title, status, decided_by, decided_at, created_at, error")
      .eq("business_id", biz.businessId)
      .neq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("agent_runs").select("id, agent, trigger, status, summary, proposed, started_at").eq("business_id", biz.businessId).order("started_at", { ascending: false }).limit(8),
    supabase.from("agent_settings").select("enabled, follow_up_days, chat_language").eq("business_id", biz.businessId).maybeSingle(),
  ]);

  const tasks = (waiting ?? []) as TaskRow[];
  const prospectIds = [...new Set(tasks.map((t) => t.prospect_id).filter((x): x is string => !!x))];
  const peopleIds = [...new Set((decided ?? []).map((d) => d.decided_by).filter((x): x is string => !!x))];
  const [{ data: prospects }, { data: people }] = await Promise.all([
    prospectIds.length ? supabase.from("prospects").select("id, name").in("id", prospectIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    peopleIds.length ? supabase.from("profiles").select("id, full_name").in("id", peopleIds) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
  ]);
  const prospectName = new Map((prospects ?? []).map((p) => [p.id, p.name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const cfg = { ...DEFAULT_AGENT_SETTINGS, ...(settings ?? {}) };
  const aiOn = await aiEnabled(biz.businessId);
  const canAct = can(biz.role, "lead.update");
  const canManage = can(biz.role, "lead.assign");
  const lastRun = runs?.[0];

  return (
    <>
      <PageHeader icon3d="robot" tone="lavender"
        title="AI agents"
        description={say("Your AI sales team goes through your leads every morning and suggests what to do next. Nothing goes to a buyer until someone on your team approves it.", "Tuwing umaga, dinadaanan ng AI sales team mo ang leads mo at nagsa-suggest ng susunod na gagawin. Walang mapupunta sa buyer hangga't walang nag-a-approve sa team mo.")}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-8">
          <section aria-labelledby="waiting">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <IconTitle id="waiting" icon="bell" size={26} className="text-xl font-bold tracking-tight">
                Waiting for you
              </IconTitle>
              <span className="text-sm text-muted">{tasks.length ? `${tasks.length} suggestion${tasks.length === 1 ? "" : "s"}` : ""}</span>
            </div>
            {tasks.length ? (
              <ul className="space-y-3">
                {tasks.map((t) => (
                  <TaskCard key={t.id} t={t} prospectName={t.prospect_id ? prospectName.get(t.prospect_id) : null} canAct={canAct} />
                ))}
              </ul>
            ) : (
              <div className="rounded-[1.5rem] border-2 border-dashed border-grape-100 bg-white/60 px-6 py-12 text-center">
                <IconTile name="party" tone="mint" size={64} className="mx-auto" />
                <p className="mt-3 font-semibold">{say("You're all caught up", "Wala ka nang naiwan")}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  {lastRun
                    ? say(`Last check ${timeAgo(lastRun.started_at)}: ${lastRun.summary ?? "done"}`, `Huling check ${timeAgo(lastRun.started_at)}: ${lastRun.summary ?? "done"}`)
                    : say("The first check runs tomorrow morning. Owners and admins can run it now.", "Bukas ng umaga ang unang check. Pwede itong i-run ngayon ng owners at admins.")}
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="activity">
            <IconTitle id="activity" icon="clipboard" size={26} className="mb-3 text-xl font-bold tracking-tight">
              Recent activity
            </IconTitle>
            {(runs ?? []).length || (decided ?? []).length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white text-sm">
                {(decided ?? []).map((d) => {
                  const s = DECIDED[d.status] ?? DECIDED.done!;
                  return (
                    <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3">
                      <span className="min-w-0">
                        <span className={cx("font-medium", s.tone)}>{s.label}</span> · {d.title}
                        {d.status === "failed" && d.error ? <span className="block text-xs text-hot">{d.error}</span> : null}
                      </span>
                      <span className="text-xs text-muted">
                        {d.decided_by ? `${personName.get(d.decided_by) ?? "Teammate"}, ` : ""}
                        {timeAgo(d.decided_at ?? d.created_at)}
                      </span>
                    </li>
                  );
                })}
                {(runs ?? []).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 bg-zinc-50/60 px-4 py-3">
                    <span className="min-w-0 text-muted">
                      <span className="font-medium text-ink">{agentName(r.agent)}</span>
                      {r.trigger === "manual" ? " (run by hand)" : ""}: {r.status === "running" ? "working…" : r.summary}
                    </span>
                    <span className="text-xs text-muted">{timeAgo(r.started_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{say("Nothing yet. What the agents find and what your team decides will show up here.", "Wala pa. Dito lalabas ang makikita ng agents at ang mga desisyon ng team mo.")}</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <IconTitle icon="robot" className="text-sm font-semibold">Your AI team</IconTitle>
            <ul className="mt-3 space-y-3.5">
              {AGENT_INFO.map((a) => (
                <li key={a.key} className="flex gap-3">
                  {a.live ? (
                    cfg.enabled ? (
                      <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    ) : (
                      <CircleX className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    )
                  ) : (
                    <CircleDashed className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
                  )}
                  <div>
                    <p className={cx("text-sm font-medium", !a.live && "text-muted")}>
                      {a.name}{" "}
                      <span className="text-xs font-normal text-muted">{!a.live ? "· Coming next" : a.key !== "pipeline" && !aiOn ? "· Basic plan" : cfg.enabled ? "· On" : "· Paused"}</span>
                    </p>
                    <p className="text-xs text-muted">{say(a.does, a.doesTl)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {canManage ? (
            <Card className="space-y-5 p-5">
              <div>
                <IconTitle icon="gear" className="text-sm font-semibold">Settings</IconTitle>
                <p className="mt-1 text-xs text-muted">
                  {lastRun ? `Last run ${timeAgo(lastRun.started_at)}.` : "Not run yet."} Agents only suggest; they never message anyone on their own.
                </p>
              </div>
              <AgentSettingsForm enabled={cfg.enabled} followUpDays={cfg.follow_up_days} chatLanguage={cfg.chat_language === "english" ? "english" : "taglish"} />
              <div className="border-t border-line pt-4">
                <RunNow />
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
