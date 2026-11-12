import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, MessageCircle, MessageSquareText, Phone, Smartphone } from "lucide-react";
import { can } from "@propilot/shared";
import { Card, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getUser, requireBusiness } from "@/lib/auth";
import { isoToManilaInput, manilaDateTime, STATUS_LABEL } from "@/lib/leads";
import { centavosToPesosInput } from "@/lib/money";
import { KIND_LABEL, SOURCE_LABEL, STAGE_INFO, type Kind, type Stage } from "@/lib/pipeline";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { TaskCard, type TaskRow } from "../../agents/task-card";
import { addProspectNote, assignProspect, deleteProspect } from "../actions";
import { ProspectDetailsForm } from "../prospect-forms";
import { QualificationCard } from "./qualification-card";

// Running the AI agents by hand can take up to about 40 seconds.
export const maxDuration = 60;

const STAGE_TONE: Record<Stage, string> = {
  inquiry: "bg-zinc-100 text-zinc-700",
  qualified: "bg-brass-50 text-[#7d5f26]",
  viewing: "bg-brand-50 text-brand-700",
  offer: "bg-brand-50 text-brand-700",
  reservation: "bg-brand-100 text-brand-900",
  won: "bg-brand-600 text-white",
  lost: "bg-zinc-100 text-zinc-500",
};

export default async function ProspectPage({ params }: PageProps<"/app/pipeline/[id]">) {
  const { id } = await params;
  const [biz, me] = await Promise.all([requireBusiness(), getUser()]);
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned")) redirect("/app");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("prospects")
    .select(
      "id, buyer_id, name, phone, email, kind, source, stage, property_id, assigned_to, deal_value_minor, lost_reason, next_step, next_step_at, created_at, last_activity_at, budget_min_minor, budget_max_minor, areas, property_types, timeline, financing, facts_by, score, temperature, score_reason, missing, qualified_at",
    )
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: events }, { data: tasks }, { data: requests }, { data: chats }, { data: listings }, { data: members }, { data: prefRows }] = await Promise.all([
    supabase.from("prospect_events").select("id, kind, body, actor, created_at").eq("prospect_id", id).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("agent_tasks")
      .select("id, agent, kind, title, reason, draft, prospect_id, conversation_id, proposed_stage, created_at")
      .eq("prospect_id", id)
      .eq("status", "proposed")
      .order("created_at", { ascending: false }),
    supabase.from("viewing_requests").select("id, property_id, status, scheduled_at, created_at").eq("prospect_id", id).order("created_at", { ascending: false }),
    supabase.from("messenger_conversations").select("id, channel, last_message_at, mode").eq("prospect_id", id).order("last_message_at", { ascending: false }),
    supabase.from("properties").select("id, name").eq("business_id", biz.businessId).neq("status", "archived").order("name").limit(300),
    supabase.from("business_members").select("user_id, role").eq("business_id", biz.businessId).eq("status", "active").in("role", ["owner", "admin", "agent"]),
    p.buyer_id ? supabase.rpc("prospect_buyer_preferences", { p_prospect: id }) : Promise.resolve({ data: [] }),
  ]);
  const prefs = (Array.isArray(prefRows) && prefRows[0]) || null;

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const actorIds = (events ?? []).map((e) => e.actor).filter((x): x is string => !!x);
  const peopleIds = [...new Set([...memberIds, ...actorIds])];
  const { data: people } = peopleIds.length ? await supabase.from("profiles").select("id, full_name, email").in("id", peopleIds) : { data: [] };
  const nameOf = new Map((people ?? []).map((x) => [x.id, (x.full_name as string) || (x.email as string) || "Teammate"]));
  const listingName = new Map((listings ?? []).map((l) => [l.id, l.name]));
  const canEdit = can(biz.role, "lead.update");
  const canAssign = can(biz.role, "lead.assign");
  const stage = p.stage as Stage;
  const phone = (p.phone ?? "").replace(/[^\d+]/g, "");

  return (
    <>
      <Link href="/app/pipeline" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Pipeline
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[2rem] leading-tight font-medium">{p.name || "Unnamed lead"}</h1>
            <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", STAGE_TONE[stage])}>{STAGE_INFO[stage].label}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {KIND_LABEL[p.kind as Kind] ?? "Buyer"} · {SOURCE_LABEL[p.source] ?? "Lead"} · since {timeAgo(p.created_at)}
            {p.property_id && listingName.get(p.property_id) ? (
              <>
                {" "}
                · interested in{" "}
                <Link href={`/app/properties/${p.property_id}`} className="font-medium text-ink hover:text-brand-700">
                  {listingName.get(p.property_id)}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone ? (
            <>
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium hover:border-zinc-300">
                <Phone className="size-4" aria-hidden /> {p.phone}
              </a>
              <a href={`sms:${phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium hover:border-zinc-300">
                <MessageSquareText className="size-4" aria-hidden /> Text
              </a>
            </>
          ) : null}
          {p.email ? (
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium hover:border-zinc-300">
              <Mail className="size-4" aria-hidden /> Email
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {tasks?.length ? (
            <section aria-labelledby="ai-tasks">
              <h2 id="ai-tasks" className="mb-3 text-sm font-semibold">
                AI suggestions
              </h2>
              <ul className="space-y-3">
                {(tasks as TaskRow[]).map((t) => (
                  <TaskCard key={t.id} t={t} canAct={canEdit} showLead={false} />
                ))}
              </ul>
            </section>
          ) : null}

          {requests?.length || chats?.length ? (
            <section aria-labelledby="linked">
              <h2 id="linked" className="mb-3 text-sm font-semibold">
                Requests and chats
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {(requests ?? []).map((r) => (
                  <li key={r.id}>
                    <Link href="/app/leads?show=all" className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
                        <span className="truncate">Viewing request: {listingName.get(r.property_id) ?? "a listing"}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {r.scheduled_at ? manilaDateTime(r.scheduled_at) : (STATUS_LABEL[r.status] ?? r.status)}
                      </span>
                    </Link>
                  </li>
                ))}
                {(chats ?? []).map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/inbox?c=${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50">
                      <span className="flex items-center gap-2.5">
                        {c.channel === "app" ? <Smartphone className="size-4 text-muted" aria-hidden /> : <MessageCircle className="size-4 text-muted" aria-hidden />}
                        {c.channel === "app" ? "ProPilot chat" : "Messenger chat"}
                        <span className="text-xs text-muted">{c.mode === "ai" ? "AI answering" : "Team answering"}</span>
                      </span>
                      <span className="text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="timeline">
            <h2 id="timeline" className="mb-3 text-sm font-semibold">
              Timeline
            </h2>
            {canEdit ? (
              <form action={addProspectNote.bind(null, p.id)} className="mb-4 flex gap-2">
                <label htmlFor="note" className="sr-only">
                  Add a note
                </label>
                <input
                  id="note"
                  name="note"
                  maxLength={1000}
                  required
                  placeholder="Add a note for the team, e.g. Wants a unit facing east"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                />
                <SubmitButton variant="secondary" pendingText="Adding…">
                  Add note
                </SubmitButton>
              </form>
            ) : null}
            <ol className="relative space-y-4 border-l border-line pl-5">
              {(events ?? []).map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={cx(
                      "absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface",
                      e.kind === "note" ? "bg-brass" : e.kind === "stage" ? "bg-brand-600" : "bg-zinc-300",
                    )}
                    aria-hidden
                  />
                  <p className={cx("text-sm", e.kind === "note" && "rounded-lg bg-white px-3 py-2 ring-1 ring-line")}>{e.body}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.actor ? nameOf.get(e.actor) ?? "Teammate" : "ProPilot"} · {timeAgo(e.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <QualificationCard
            key={p.qualified_at ?? "new"}
            q={{
              id: p.id,
              budget_min_minor: p.budget_min_minor,
              budget_max_minor: p.budget_max_minor,
              areas: p.areas ?? [],
              property_types: p.property_types ?? [],
              timeline: p.timeline,
              financing: p.financing,
              score: p.score,
              temperature: p.temperature,
              score_reason: p.score_reason,
              missing: p.missing ?? [],
              qualified_at: p.qualified_at,
              facts_by: p.facts_by,
            }}
            prefs={prefs}
            canEdit={canEdit}
            aiOn={Boolean(process.env.ANTHROPIC_API_KEY)}
          />
          {canEdit ? (
            <Card className="p-5">
              <ProspectDetailsForm
                key={`${p.stage}-${p.next_step_at}-${p.deal_value_minor}`}
                listings={listings ?? []}
                p={{
                  id: p.id,
                  name: p.name,
                  phone: p.phone,
                  email: p.email,
                  kind: p.kind,
                  stage,
                  property_id: p.property_id,
                  lost_reason: p.lost_reason,
                  dealValue: centavosToPesosInput(p.deal_value_minor),
                  next_step: p.next_step,
                  nextStepAt: isoToManilaInput(p.next_step_at),
                }}
              />
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-sm font-semibold">Handled by</h2>
            <p className="mt-1 text-sm text-muted">{p.assigned_to ? (nameOf.get(p.assigned_to) ?? "A teammate") : "No one yet"}</p>
            {canAssign ? (
              <form action={assignProspect.bind(null, p.id)} className="mt-3 flex gap-2">
                <label htmlFor="assignee" className="sr-only">
                  Assign to
                </label>
                <select
                  id="assignee"
                  name="assignee"
                  defaultValue={p.assigned_to ?? ""}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                >
                  <option value="">No one</option>
                  {memberIds.map((uid) => (
                    <option key={uid} value={uid}>
                      {nameOf.get(uid) ?? "Teammate"}
                      {uid === me?.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
                <SubmitButton variant="secondary" pendingText="…">
                  Assign
                </SubmitButton>
              </form>
            ) : canEdit && p.assigned_to !== me?.id ? (
              <form action={assignProspect.bind(null, p.id)} className="mt-3">
                <input type="hidden" name="assignee" value="me" />
                <SubmitButton variant="secondary" pendingText="…">
                  Take this lead
                </SubmitButton>
              </form>
            ) : null}
          </Card>

          {canAssign ? (
            <details className="rounded-2xl border border-line bg-white px-5 py-3 text-sm">
              <summary className="cursor-pointer text-muted">Delete this lead</summary>
              <p className="mt-2 text-muted">
                Removes the lead and its timeline. Viewing requests and chats stay where they are. This can&apos;t be undone.
              </p>
              <form action={deleteProspect.bind(null, p.id)} className="mt-3 mb-1">
                <SubmitButton variant="danger" pendingText="Deleting…">
                  Delete lead
                </SubmitButton>
              </form>
            </details>
          ) : null}
        </aside>
      </div>
    </>
  );
}
