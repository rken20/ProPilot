import Link from "next/link";
import { can } from "@propilot/shared";
import { redirect } from "next/navigation";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { followUpsDue } from "@/lib/follow-up";
import { appSay } from "@/lib/lang-server";
import { OPEN_STAGES, STAGE_INFO, type Stage } from "@/lib/pipeline";
import { aiEnabled } from "@/lib/plan";
import { createClient } from "@/lib/supabase/server";
import { markFollowedUp, writeFollowUp } from "./actions";
import { FollowUpList, type FollowUpItem } from "./follow-up-list";

export const metadata = { title: "Follow-up Assistant" };
// Writing a message asks the AI, which can take a few seconds.
export const maxDuration = 30;

/** Leads that are due a message: quiet for a few days, or with a next step whose date has come. */
export default async function FollowUpsPage() {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.viewAll") && !can(biz.role, "lead.viewAssigned"))
    redirect("/app");
  const say = await appSay();
  const supabase = await createClient();

  const [{ data: cfg }, { data: leads }, aiOn] = await Promise.all([
    supabase
      .from("agent_settings")
      .select("follow_up_days")
      .eq("business_id", biz.businessId)
      .maybeSingle(),
    // Row-level security returns only the leads this person may see (agents: their own).
    supabase
      .from("prospects")
      .select(
        "id, name, phone, stage, temperature, last_activity_at, next_step, next_step_at, property_id, properties(name)",
      )
      .eq("business_id", biz.businessId)
      .in("stage", OPEN_STAGES as unknown as string[])
      .order("last_activity_at", { ascending: true })
      .limit(500),
    aiEnabled(biz.businessId),
  ]);
  const quietDays = Number(cfg?.follow_up_days ?? 3);
  const due = followUpsDue(
    (leads ?? []).map((l) => ({
      ...l,
      name: l.name as string | null,
      stage: l.stage as string,
      temperature: (l.temperature as string | null) ?? null,
      last_activity_at: l.last_activity_at as string,
      next_step: l.next_step as string | null,
      next_step_at: l.next_step_at as string | null,
    })),
    quietDays,
    new Date(),
  ).slice(0, 50);

  const ids = due.map((d) => d.lead.id as string);
  const { data: chats } = ids.length
    ? await supabase
        .from("messenger_conversations")
        .select("id, prospect_id")
        .eq("business_id", biz.businessId)
        .in("prospect_id", ids)
    : { data: [] };
  const chatOf = new Map(
    (chats ?? []).map((c) => [c.prospect_id as string, c.id as string]),
  );

  const items: FollowUpItem[] = due.map(({ lead, why, days }) => ({
    id: lead.id as string,
    name: lead.name || "Unnamed lead",
    stage: STAGE_INFO[lead.stage as Stage]?.label ?? lead.stage,
    temperature: lead.temperature,
    why,
    days,
    nextStep: lead.next_step,
    listing:
      (lead.properties as unknown as { name: string } | null)?.name ?? null,
    phone: (lead.phone as string | null) ?? null,
    chatHref: chatOf.has(lead.id as string)
      ? `/app/inbox?c=${chatOf.get(lead.id as string)}`
      : null,
  }));

  return (
    <>
      <PageHeader
        icon3d="bell"
        tone="lemon"
        title="Follow-up Assistant"
        description={say(
          `Leads with no messages or updates for ${quietDays} days, or with a next step that's due. Get a message written, send it yourself, then mark it done.`,
          `Leads na walang message o update nang ${quietDays} araw, o may next step na due na. Ipasulat ang message, ikaw ang mag-send, tapos i-mark na tapos.`,
        )}
        action={
          can(biz.role, "business.update") ? (
            <Link href="/app/agents" className={buttonClass("secondary")}>
              {say("Change the number of days", "Baguhin ang bilang ng araw")}
            </Link>
          ) : undefined
        }
      />
      {items.length ? (
        <FollowUpList
          items={items}
          aiOn={aiOn}
          actions={{ write: writeFollowUp, done: markFollowedUp }}
        />
      ) : (
        <EmptyState
          icon="party"
          tone="mint"
          title={say("Nobody is waiting on you", "Walang naghihintay sa'yo")}
          action={
            <Link href="/app/pipeline" className={buttonClass("secondary")}>
              Open Leads
            </Link>
          }
        >
          {say(
            `Every open lead has had a message or an update in the last ${quietDays} days.`,
            `Lahat ng open lead ay may message o update nitong huling ${quietDays} araw.`,
          )}
        </EmptyState>
      )}
    </>
  );
}
