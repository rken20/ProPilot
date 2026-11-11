/**
 * Report maths. Pure functions over rows the server has already scoped to one
 * business, so every number here can be tested without a database. Days and
 * weeks are Manila days (UTC+8, no daylight saving).
 */

const MANILA_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86_400_000;

// ------------------------------------------------------------------ ranges

export type Range = { from: Date; to: Date; key: string; label: string; days: number };
export const PRESETS = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["month", "This month"],
  ["last-month", "Last month"],
] as const;

/** Midnight in Manila for the Manila day containing `d`. */
export function manilaDayStart(d: Date): Date {
  const local = d.getTime() + MANILA_OFFSET_MS;
  return new Date(local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - MANILA_OFFSET_MS);
}

function manilaYmd(d: Date): string {
  return new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function fromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+08:00`);
}

/** The range a report covers, from ?range= or ?from=&to= (YYYY-MM-DD). Defaults to the last 30 days. */
export function parseRange(params: { range?: string; from?: string; to?: string }, now = new Date()): Range {
  const today = manilaDayStart(now);
  const end = new Date(today.getTime() + DAY_MS);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (params.from && params.to && ymd.test(params.from) && ymd.test(params.to)) {
    let from = fromYmd(params.from);
    let to = new Date(fromYmd(params.to).getTime() + DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return parseRange({}, now);
    if (from > to) [from, to] = [new Date(to.getTime() - DAY_MS), new Date(from.getTime() + DAY_MS)];
    if (to > end) to = end;
    if ((to.getTime() - from.getTime()) / DAY_MS > 366) from = new Date(to.getTime() - 366 * DAY_MS);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
    return { from, to, key: `from=${manilaYmd(from)}&to=${manilaYmd(new Date(to.getTime() - 1))}`, label: `${fmtDay(from)} to ${fmtDay(new Date(to.getTime() - 1))}`, days };
  }
  const key = PRESETS.some(([k]) => k === params.range) ? params.range! : "30";
  const label = PRESETS.find(([k]) => k === key)![1];
  if (key === "month" || key === "last-month") {
    const [y, m] = manilaYmd(now).split("-").map(Number) as [number, number];
    const first = key === "month" ? fromYmd(`${y}-${String(m).padStart(2, "0")}-01`) : fromYmd(m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`);
    const to = key === "month" ? end : fromYmd(`${y}-${String(m).padStart(2, "0")}-01`);
    return { from: first, to, key: `range=${key}`, label, days: Math.round((to.getTime() - first.getTime()) / DAY_MS) };
  }
  const days = Number(key);
  return { from: new Date(end.getTime() - days * DAY_MS), to: end, key: `range=${key}`, label, days };
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" });

export type Bucket = { start: Date; end: Date; label: string };

/** Daily bars up to 31 days, weekly (from Monday) beyond. */
export function buckets(r: Range): Bucket[] {
  const out: Bucket[] = [];
  if (r.days <= 31) {
    for (let t = r.from.getTime(); t < r.to.getTime(); t += DAY_MS) {
      out.push({ start: new Date(t), end: new Date(t + DAY_MS), label: fmtDay(new Date(t)) });
    }
    return out;
  }
  // Back up to the Monday on or before the start.
  const startDow = new Date(r.from.getTime() + MANILA_OFFSET_MS).getUTCDay(); // 0 Sun … 6 Sat
  let t = r.from.getTime() - ((startDow + 6) % 7) * DAY_MS;
  while (t < r.to.getTime()) {
    const s = new Date(Math.max(t, r.from.getTime()));
    const e = new Date(Math.min(t + 7 * DAY_MS, r.to.getTime()));
    out.push({ start: s, end: e, label: `Wk of ${fmtDay(s)}` });
    t += 7 * DAY_MS;
  }
  return out;
}

export function inRange(iso: string | null | undefined, r: { from: Date; to: Date }): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
}

// ------------------------------------------------------------------ helpers

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** "45 sec", "12 min", "3.5 hr", "2 days". */
export function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  const s = ms / 1000;
  if (s < 90) return `${Math.max(1, Math.round(s))} sec`;
  const m = s / 60;
  if (m < 90) return `${Math.round(m)} min`;
  const h = m / 60;
  if (h < 36) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hr`;
  return `${Math.round(h / 24)} days`;
}

export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

const ms = (iso: string) => new Date(iso).getTime();

/** Outside 8 am to 6 pm Manila, Monday to Saturday. */
export function afterHours(iso: string): boolean {
  const local = new Date(ms(iso) + MANILA_OFFSET_MS);
  const hour = local.getUTCHours();
  return local.getUTCDay() === 0 || hour < 8 || hour >= 18;
}

// ------------------------------------------------------------------ rows

export type ViewingRow = {
  id: string;
  property_id: string;
  status: "new" | "contacted" | "scheduled" | "completed" | "closed";
  created_at: string;
  first_response_at: string | null;
  responded_by: string | null;
  closed_at: string | null;
};
export type ConversationRow = {
  id: string;
  created_at: string;
  mode: "ai" | "human";
  taken_over_by: string | null;
  lead_status: "none" | "new" | "contacted" | "scheduled" | "closed";
  property_id: string | null;
};
export type MessageRow = { conversation_id: string; sender: "buyer" | "ai" | "agent" | "page"; sent_by: string | null; created_at: string };
export type PropertyRow = {
  id: string;
  name: string;
  location: string;
  status: string;
  price_minor: number;
  created_at: string;
  sold_at: string | null;
  assigned_agent_id: string | null;
};
export type EventRow = { property_id: string; created_at: string };
export type MemberRow = { user_id: string; role: string; name: string };

// ------------------------------------------------------------------ leads and conversions

export type LeadsReport = {
  inquiries: number;
  fromProPilot: number;
  fromMessenger: number;
  viewingRequests: number;
  reachedViewing: number;
  closed: number;
  conversion: number | null;
  medianFirstResponseMs: number | null;
  stages: Array<{ label: string; value: number }>;
  series: Array<{ label: string; propilot: number; messenger: number }>;
};

/** `vr` and `convs` are the ones created in the range. */
export function leadsReport(vr: ViewingRow[], convs: ConversationRow[], r: Range): LeadsReport {
  const msgrLeads = convs.filter((c) => c.lead_status !== "none");
  const count = (s: string) => vr.filter((v) => v.status === s).length + msgrLeads.filter((c) => c.lead_status === s).length;
  const viewingRequests = vr.length + msgrLeads.length;
  const reachedViewing = count("scheduled") + count("completed");
  const closed = count("closed");
  return {
    inquiries: vr.length + convs.length,
    fromProPilot: vr.length,
    fromMessenger: convs.length,
    viewingRequests,
    reachedViewing,
    closed,
    conversion: pct(reachedViewing, viewingRequests),
    medianFirstResponseMs: median(vr.filter((v) => v.first_response_at).map((v) => ms(v.first_response_at!) - ms(v.created_at))),
    stages: [
      { label: "New", value: count("new") },
      { label: "Contacted", value: count("contacted") },
      { label: "Viewing scheduled", value: count("scheduled") },
      { label: "Viewing done", value: count("completed") },
      { label: "Closed", value: closed },
    ],
    series: buckets(r).map((b) => ({
      label: b.label,
      propilot: vr.filter((v) => inRange(v.created_at, { from: b.start, to: b.end })).length,
      messenger: convs.filter((c) => inRange(c.created_at, { from: b.start, to: b.end })).length,
    })),
  };
}

// ------------------------------------------------------------------ listing performance

export type ListingPerf = {
  id: string;
  name: string;
  location: string;
  status: string;
  price_minor: number;
  saves: number;
  questions: number;
  viewingRequests: number;
  facebookPosts: number;
  daysOnMarket: number;
};

/** Events are the ones in the range; days on the market run to the sold date or today. */
export function listingReport(
  props: PropertyRow[],
  vr: ViewingRow[],
  convs: ConversationRow[],
  saves: EventRow[],
  questions: EventRow[],
  posts: EventRow[],
  now = new Date(),
): ListingPerf[] {
  const tally = (rows: Array<{ property_id: string | null }>) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.property_id) m.set(r.property_id, (m.get(r.property_id) ?? 0) + 1);
    return m;
  };
  const s = tally(saves);
  const q = tally(questions);
  const v = tally([...vr, ...convs.filter((c) => c.lead_status !== "none")]);
  const p = tally(posts);
  return props
    .map((x) => ({
      id: x.id,
      name: x.name,
      location: x.location,
      status: x.status,
      price_minor: Number(x.price_minor),
      saves: s.get(x.id) ?? 0,
      questions: q.get(x.id) ?? 0,
      viewingRequests: v.get(x.id) ?? 0,
      facebookPosts: p.get(x.id) ?? 0,
      daysOnMarket: Math.max(0, Math.floor(((x.sold_at ? ms(x.sold_at) : now.getTime()) - ms(x.created_at)) / DAY_MS)),
    }))
    .filter((x) => x.status !== "archived" || x.saves + x.questions + x.viewingRequests + x.facebookPosts > 0)
    .sort((a, b) => b.viewingRequests - a.viewingRequests || b.questions - a.questions || b.saves - a.saves || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ Messenger AI

export type MessengerReport = {
  conversations: number;
  aiOnly: number;
  handedOver: number;
  aiReplies: number;
  afterHoursAnswered: number;
  viewingRequests: number;
  medianAiReplyMs: number | null;
  medianTeamReplyMs: number | null;
};

/** `convs` started in the range; `msgs` are all messages in the range. */
export function messengerReport(convs: ConversationRow[], msgs: MessageRow[]): MessengerReport {
  const byConv = new Map<string, MessageRow[]>();
  for (const m of [...msgs].sort((a, b) => ms(a.created_at) - ms(b.created_at))) {
    byConv.set(m.conversation_id, [...(byConv.get(m.conversation_id) ?? []), m]);
  }
  const human = (c: ConversationRow) => c.mode === "human" || (byConv.get(c.id) ?? []).some((m) => m.sender === "agent" || m.sender === "page");
  const aiTimes: number[] = [];
  const teamTimes: number[] = [];
  let afterHoursAnswered = 0;
  for (const list of byConv.values()) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!;
      if (m.sender !== "buyer" || list[i - 1]?.sender === "buyer") continue; // first message of each buyer turn
      const reply = list.slice(i + 1).find((x) => x.sender !== "buyer");
      if (!reply) continue;
      const delta = ms(reply.created_at) - ms(m.created_at);
      if (reply.sender === "ai") {
        aiTimes.push(delta);
        if (afterHours(m.created_at)) afterHoursAnswered++;
      } else teamTimes.push(delta);
    }
  }
  const handedOver = convs.filter(human).length;
  return {
    conversations: convs.length,
    aiOnly: convs.length - handedOver,
    handedOver,
    aiReplies: msgs.filter((m) => m.sender === "ai").length,
    afterHoursAnswered,
    viewingRequests: convs.filter((c) => c.lead_status !== "none").length,
    medianAiReplyMs: median(aiTimes),
    medianTeamReplyMs: median(teamTimes),
  };
}

// ------------------------------------------------------------------ team

export type TeamRow = {
  userId: string;
  name: string;
  role: string;
  listings: number;
  leadsOnListings: number;
  responded: number;
  medianResponseMs: number | null;
  viewings: number;
  closed: number;
  chatsTakenOver: number;
  messengerReplies: number;
};

/** `vr`, `convs` and `msgs` are the ones in the range; listings are current assignments. */
export function teamReport(members: MemberRow[], props: PropertyRow[], vr: ViewingRow[], convs: ConversationRow[], msgs: MessageRow[]): TeamRow[] {
  const owner = new Map(props.map((p) => [p.id, p.assigned_agent_id]));
  return members
    .map((m) => {
      const mine = vr.filter((v) => v.responded_by === m.user_id);
      return {
        userId: m.user_id,
        name: m.name,
        role: m.role,
        listings: props.filter((p) => p.assigned_agent_id === m.user_id && p.status !== "archived").length,
        leadsOnListings: vr.filter((v) => owner.get(v.property_id) === m.user_id).length,
        responded: mine.length,
        medianResponseMs: median(mine.filter((v) => v.first_response_at).map((v) => ms(v.first_response_at!) - ms(v.created_at))),
        viewings: mine.filter((v) => v.status === "scheduled" || v.status === "completed").length,
        closed: mine.filter((v) => v.status === "closed").length,
        chatsTakenOver: convs.filter((c) => c.taken_over_by === m.user_id).length,
        messengerReplies: msgs.filter((x) => x.sender === "agent" && x.sent_by === m.user_id).length,
      };
    })
    .sort((a, b) => b.responded + b.messengerReplies - (a.responded + a.messengerReplies) || a.name.localeCompare(b.name));
}
