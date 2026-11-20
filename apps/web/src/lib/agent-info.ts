/** The AI sales team, as shown on the AI agents page. Order is the build order. */
export const AGENT_INFO = [
  {
    key: "pipeline",
    name: "Pipeline keeper",
    does: "Checks your pipeline every morning for unanswered viewing requests, quiet leads and next steps that are due.",
    live: true,
  },
  {
    key: "qualifier",
    name: "Lead qualifier",
    does: "Reads each lead's chats, requests and notes for budget, area, timing and financing, scores them hot, warm or cold, and suggests who's ready for Qualified.",
    live: true,
  },
  {
    key: "matcher",
    name: "Property matcher",
    does: "Each morning, finds the best new listing for each open lead by budget, area, type and financing, and drafts a message for you to approve.",
    live: true,
  },
  {
    key: "follow_up",
    name: "Follow-up writer",
    does: "Drafts check-ins, viewing invites with open calendar times, and new-match messages for you to approve.",
    live: false,
  },
  {
    key: "discovery",
    name: "Buyer Finder",
    does: "On each listing, shows which leads fit it, from Messenger, listing inquiries and leads you add. The AI reads each chat for budget and area. Add up to 5 a month as potential buyers on Basic, 20 on Pro, 60 on Agency.",
    live: true,
  },
] as const;

export type AgentKey = "pipeline" | "qualifier" | "matcher" | "follow_up" | "outreach" | "discovery";

export function agentName(key: string): string {
  return AGENT_INFO.find((a) => a.key === key)?.name ?? "AI agent";
}

export const DEFAULT_AGENT_SETTINGS = { enabled: true, follow_up_days: 3 };
