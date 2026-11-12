/**
 * The sales pipeline: stages, labels, and the Pipeline keeper's rules.
 * Everything here is pure so it can be tested without a database.
 */

export const STAGES = ["inquiry", "qualified", "viewing", "offer", "reservation", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES = ["inquiry", "qualified", "viewing", "offer", "reservation"] as const satisfies readonly Stage[];

export const STAGE_INFO: Record<Stage, { label: string; help: string }> = {
  inquiry: { label: "Inquiry", help: "Asked about a listing" },
  qualified: { label: "Qualified", help: "Budget, area and timing fit" },
  viewing: { label: "Viewing", help: "Viewing set or done" },
  offer: { label: "Offer", help: "Negotiating price or terms" },
  reservation: { label: "Reservation", help: "Reservation paid, papers in progress" },
  won: { label: "Won", help: "Sale or lease closed" },
  lost: { label: "Lost", help: "Not going ahead" },
};

export const KINDS = ["buyer", "seller", "investor"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { buyer: "Buyer", seller: "Seller", investor: "Investor" };

export const SOURCE_LABEL: Record<string, string> = {
  viewing_request: "Viewing request",
  messenger: "Messenger",
  app_chat: "ProPilot chat",
  manual: "Added by hand",
};

export function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v);
}
export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

const DAY = 86_400_000;

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

/** Whether an open prospect has gone quiet for longer than the business's follow-up setting. */
export function isQuiet(p: { stage: string; last_activity_at: string }, followUpDays: number, now: Date): boolean {
  return (OPEN_STAGES as readonly string[]).includes(p.stage) && daysSince(p.last_activity_at, now) >= followUpDays;
}

// ---------------------------------------------------------------- Pipeline keeper

export type KeeperProspect = {
  id: string;
  name: string | null;
  stage: string;
  last_activity_at: string;
  next_step: string | null;
  next_step_at: string | null;
};
export type KeeperRequest = { id: string; buyer_name: string; property_name: string | null; created_at: string; prospect_id: string | null };
/** Tasks from the last 30 days: what's open, and when each key was last closed. */
export type RecentTask = { dedupe_key: string | null; status: string; decided_at: string | null; created_at: string };

export type Proposal = {
  prospect_id: string | null;
  agent: "pipeline";
  kind: "reminder";
  title: string;
  reason: string;
  dedupe_key: string;
  due_at: string;
};

const MAX_PER_RUN = 40;

/**
 * The Pipeline keeper looks for leads that are slipping: viewing requests no
 * one has answered in a day, prospects that have gone quiet, and next steps
 * that are due. It only proposes reminders; it never contacts anyone.
 */
export function keeperProposals(input: {
  prospects: KeeperProspect[];
  newRequests: KeeperRequest[];
  recent: RecentTask[];
  followUpDays: number;
  now: Date;
}): Proposal[] {
  const { now, followUpDays } = input;
  const open = new Set<string>();
  const lastClosed = new Map<string, number>();
  for (const t of input.recent) {
    if (!t.dedupe_key) continue;
    if (t.status === "proposed" || t.status === "sending") open.add(t.dedupe_key);
    else {
      const at = new Date(t.decided_at ?? t.created_at).getTime();
      lastClosed.set(t.dedupe_key, Math.max(at, lastClosed.get(t.dedupe_key) ?? 0));
    }
  }
  // A key someone dismissed or finished waits a full follow-up period before it can come back.
  const allowed = (key: string) => !open.has(key) && now.getTime() - (lastClosed.get(key) ?? 0) >= followUpDays * DAY;
  const out: Proposal[] = [];
  const due = now.toISOString();
  const name = (n: string | null) => n?.trim() || "this lead";

  for (const r of input.newRequests) {
    const age = daysSince(r.created_at, now);
    const key = `request:${r.id}`;
    if (age < 1 || !allowed(key)) continue;
    out.push({
      prospect_id: r.prospect_id,
      agent: "pipeline",
      kind: "reminder",
      title: `Reply to ${name(r.buyer_name)}'s viewing request`,
      reason: `Asked to view ${r.property_name ?? "a listing"} ${age === 1 ? "a day" : `${age} days`} ago and it's still marked New.`,
      dedupe_key: key,
      due_at: due,
    });
  }

  const flagged = new Set(out.map((p) => p.prospect_id));
  for (const p of input.prospects) {
    if (!(OPEN_STAGES as readonly string[]).includes(p.stage) || flagged.has(p.id)) continue;
    if (p.next_step_at && new Date(p.next_step_at) <= now) {
      const key = `next:${p.id}:${p.next_step_at.slice(0, 10)}`;
      if (allowed(key)) {
        out.push({
          prospect_id: p.id,
          agent: "pipeline",
          kind: "reminder",
          title: p.next_step ? `${p.next_step} (${name(p.name)})` : `Next step due for ${name(p.name)}`,
          reason: "The next step you set for this lead is due.",
          dedupe_key: key,
          due_at: due,
        });
        continue;
      }
    }
    if (isQuiet(p, followUpDays, now)) {
      const key = `quiet:${p.id}`;
      if (!allowed(key)) continue;
      const days = daysSince(p.last_activity_at, now);
      out.push({
        prospect_id: p.id,
        agent: "pipeline",
        kind: "reminder",
        title: `Check in with ${name(p.name)}`,
        reason: `No messages or updates for ${days} days. Stage: ${STAGE_INFO[p.stage as Stage].label}.`,
        dedupe_key: key,
        due_at: due,
      });
    }
  }
  return out.slice(0, MAX_PER_RUN);
}

export function keeperSummary(proposals: Proposal[]): string {
  if (!proposals.length) return "Everything is on track. Nothing needs a nudge today.";
  const requests = proposals.filter((p) => p.dedupe_key.startsWith("request:")).length;
  const next = proposals.filter((p) => p.dedupe_key.startsWith("next:")).length;
  const quiet = proposals.filter((p) => p.dedupe_key.startsWith("quiet:")).length;
  const parts = [
    requests ? `${requests} unanswered viewing request${requests === 1 ? "" : "s"}` : "",
    next ? `${next} next step${next === 1 ? "" : "s"} due` : "",
    quiet ? `${quiet} quiet lead${quiet === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return `Found ${parts.join(", ")}.`;
}
