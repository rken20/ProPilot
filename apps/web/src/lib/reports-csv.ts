import { toCsv } from "./leads";
import { formatPeso } from "./money";
import { fmtDuration, type LeadsReport, type ListingPerf, type MessengerReport, type Range, type TeamRow } from "./reports";

const STATUS: Record<string, string> = { available: "Available", reserved: "Reserved", sold: "Sold", archived: "Archived" };
const minutes = (ms: number | null) => (ms === null ? "" : String(Math.round(ms / 60000)));
const seconds = (ms: number | null) => (ms === null ? "" : String(Math.round(ms / 1000)));

export function leadsCsv(r: LeadsReport, range: Range): string {
  return toCsv([
    ["Report", "Leads and conversions"],
    ["Period", range.label],
    [],
    ["Period", "ProPilot viewing requests", "Messenger conversations", "Total inquiries"],
    ...r.series.map((s) => [s.label, String(s.propilot), String(s.messenger), String(s.propilot + s.messenger)]),
    [],
    ["Stage", "Leads"],
    ...r.stages.map((s) => [s.label, String(s.value)]),
    [],
    ["Viewing requests", String(r.viewingRequests)],
    ["Reached a viewing (%)", r.conversion === null ? "" : String(r.conversion)],
    ["Median first response (minutes)", minutes(r.medianFirstResponseMs)],
  ]);
}

export function listingsCsv(rows: ListingPerf[], range: Range): string {
  return toCsv([
    ["Report", "Listing performance"],
    ["Period", range.label],
    [],
    ["Listing", "Location", "Status", "Price", "Buyer saves", "AI questions", "Viewing requests", "Facebook posts", "Days on the market"],
    ...rows.map((l) => [
      l.name,
      l.location,
      STATUS[l.status] ?? l.status,
      formatPeso(l.price_minor),
      String(l.saves),
      String(l.questions),
      String(l.viewingRequests),
      String(l.facebookPosts),
      String(l.daysOnMarket),
    ]),
  ]);
}

export function messengerCsv(r: MessengerReport, range: Range): string {
  return toCsv([
    ["Report", "AI chat performance (ProPilot chat and Messenger)"],
    ["Period", range.label],
    [],
    ["Conversations started", String(r.conversations)],
    ["Handled by the AI alone", String(r.aiOnly)],
    ["Handed to the team", String(r.handedOver)],
    ["AI replies sent", String(r.aiReplies)],
    ["After-hours messages answered by the AI", String(r.afterHoursAnswered)],
    ["Viewing requests from chats", String(r.viewingRequests)],
    ["Median AI reply time (seconds)", seconds(r.medianAiReplyMs)],
    ["Median team reply time (minutes)", minutes(r.medianTeamReplyMs)],
  ]);
}

export function teamCsv(rows: TeamRow[], range: Range): string {
  return toCsv([
    ["Report", "Team performance"],
    ["Period", range.label],
    [],
    ["Name", "Role", "Listings assigned", "Leads on their listings", "Leads responded to", "Median first response", "Viewings", "Closed", "Chats taken over", "Chat replies"],
    ...rows.map((t) => [
      t.name,
      t.role,
      String(t.listings),
      String(t.leadsOnListings),
      String(t.responded),
      fmtDuration(t.medianResponseMs),
      String(t.viewings),
      String(t.closed),
      String(t.chatsTakenOver),
      String(t.messengerReplies),
    ]),
  ]);
}
