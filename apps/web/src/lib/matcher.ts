/**
 * The Property matcher agent's decisions, kept free of the database so they
 * can be tested. Each morning it suggests the best new listing for each open
 * lead: a ready message when the lead can be reached in a chat, otherwise a
 * reminder to tell them. It never suggests the same listing to a lead twice.
 */
import { formatPeso } from "./money";
import { rankMatches, scoreMatch, type Match, type MatchListing } from "./matching";
import { withinReplyWindow } from "./messenger-window";
import type { Facts } from "./qualification";

/** Below this, a listing isn't worth interrupting a lead for. */
export const SUGGEST_MIN_SCORE = 70;
const MAX_PER_RUN = 20;

export type MatcherLead = Facts & { id: string; name: string | null; property_id: string | null };
export type MatcherListing = MatchListing & { id: string; name: string };
export type MatcherChat = { id: string; prospect_id: string; channel: string; last_inbound_at: string | null; last_message_at: string | null };

export type MatcherProposal = {
  prospect_id: string;
  agent: "matcher";
  kind: "message" | "reminder";
  title: string;
  reason: string;
  draft: string | null;
  conversation_id: string | null;
  dedupe_key: string;
};

export const matchKey = (prospectId: string, listingId: string) => `match:${prospectId}:${listingId}`;

export function matchDraft(leadName: string | null, l: MatcherListing, m: Match): string {
  const first = (leadName ?? "").trim().split(/\s+/)[0];
  const why = m.fits.filter((f) => !f.startsWith("Within budget")).join(", ").replace(/, In /g, ", in ");
  return [
    `Hi${first ? ` ${first}` : ""}! We have a listing that fits what you're looking for: ${l.name} in ${l.location}, ${formatPeso(l.price_minor)}.`,
    why ? `${why}.` : "",
    "Would you like photos or to schedule a viewing?",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);
}

export function matcherProposals(input: {
  leads: MatcherLead[];
  listings: MatcherListing[];
  chats: MatcherChat[];
  /** Every match key suggested before, in any status. */
  suggested: Set<string>;
  now: Date;
}): MatcherProposal[] {
  const out: MatcherProposal[] = [];
  // The chat to use for each lead: the most recent one that can still take a message.
  const chatFor = new Map<string, MatcherChat>();
  for (const c of [...input.chats].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))) {
    const usable = c.channel === "app" || withinReplyWindow(c.last_inbound_at, input.now.getTime());
    if (usable && !chatFor.has(c.prospect_id)) chatFor.set(c.prospect_id, c);
  }
  for (const lead of input.leads) {
    if (out.length >= MAX_PER_RUN) break;
    const fresh = input.listings.filter((l) => l.id !== lead.property_id && !input.suggested.has(matchKey(lead.id, l.id)));
    const best = rankMatches(fresh, (l) => scoreMatch(l, lead), 1)[0];
    if (!best || best.match.score < SUGGEST_MIN_SCORE) continue;
    const who = lead.name?.trim() || "this lead";
    const reason = `${best.match.score}% match. ${[...best.match.fits, ...best.match.gaps].join(", ")}.`.slice(0, 500);
    const chat = chatFor.get(lead.id);
    out.push({
      prospect_id: lead.id,
      agent: "matcher",
      kind: chat ? "message" : "reminder",
      title: (chat ? `Send ${best.item.name} to ${who}` : `Tell ${who} about ${best.item.name}`).slice(0, 160),
      reason,
      draft: chat ? matchDraft(lead.name, best.item, best.match) : null,
      conversation_id: chat?.id ?? null,
      dedupe_key: matchKey(lead.id, best.item.id),
    });
  }
  return out;
}

export function matcherSummary(n: number): string {
  return n ? `Found ${n} listing${n === 1 ? "" : "s"} that fit${n === 1 ? "s" : ""} your leads.` : "No new listings fit your leads today.";
}
