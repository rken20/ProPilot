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
    does: "Reads each chat and request for budget, area, timing and intent, and scores the lead with a short reason.",
    live: false,
  },
  {
    key: "matcher",
    name: "Property matcher",
    does: "Matches new listings to qualified buyers, and buyers to listings that fit them.",
    live: false,
  },
  {
    key: "follow_up",
    name: "Follow-up writer",
    does: "Drafts check-ins, viewing invites with open calendar times, and new-match messages for you to approve.",
    live: false,
  },
  {
    key: "discovery",
    name: "Lead finder",
    does: "Brings in people who reached out or opted in: Lead Ads forms, Page comments, open-house sign-ups and client lists.",
    live: false,
  },
] as const;

export type AgentKey = "pipeline" | "qualifier" | "matcher" | "follow_up" | "outreach" | "discovery";

export function agentName(key: string): string {
  return AGENT_INFO.find((a) => a.key === key)?.name ?? "AI agent";
}

export const DEFAULT_AGENT_SETTINGS = { enabled: true, follow_up_days: 3 };
