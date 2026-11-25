/** The AI sales team, as shown on the AI agents page. Order is the build order. */
export const AGENT_INFO = [
  {
    key: "pipeline",
    name: "Lead keeper",
    does: "Checks your leads every morning for unanswered viewing requests, quiet leads and next steps that are due.",
    doesTl: "Tuwing umaga, chine-check ang leads mo para sa viewing requests na wala pang sagot, mga tahimik na lead at next steps na due na.",
    live: true,
  },
  {
    key: "qualifier",
    name: "Lead qualifier",
    does: "Reads each lead's chats, requests and notes for budget, area, timing and financing, scores them hot, warm or cold, and suggests who's ready for Qualified.",
    doesTl: "Binabasa ang chats, requests at notes ng bawat lead para sa budget, area, timing at financing, nilalagyan ng score na hot, warm o cold, at sina-suggest kung sino ang ready na sa Qualified.",
    live: true,
  },
  {
    key: "matcher",
    name: "Property matcher",
    does: "Each morning, finds the best new listing for each open lead by budget, area, type and financing, and drafts a message for you to approve.",
    doesTl: "Tuwing umaga, hinahanap ang pinakabagay na bagong listing para sa bawat open lead ayon sa budget, area, type at financing, at gumagawa ng draft na message na ia-approve mo.",
    live: true,
  },
  {
    key: "follow_up",
    name: "Follow-up writer",
    does: "Drafts check-ins, viewing invites with open calendar times, and new-match messages for you to approve.",
    doesTl: "Gumagawa ng draft ng check-ins, viewing invites na may bakanteng oras sa calendar, at new-match messages na ia-approve mo.",
    live: false,
  },
  {
    key: "discovery",
    name: "Buyer Finder",
    does: "On each listing, shows which leads fit it, from Messenger, listing inquiries and leads you add. The AI reads each chat for budget and area. Add up to 5 a month as potential buyers on Basic, 20 on Pro, 60 on Agency.",
    doesTl: "Sa bawat listing, ipinapakita kung aling leads ang bagay dito, mula sa Messenger, listing inquiries at leads na in-add mo. Binabasa ng AI ang bawat chat para sa budget at area. Mag-add ng hanggang 5 kada buwan bilang potential buyers sa Basic, 20 sa Pro, 60 sa Agency.",
    live: true,
  },
] as const;

export type AgentKey = "pipeline" | "qualifier" | "matcher" | "follow_up" | "outreach" | "discovery";

export function agentName(key: string): string {
  return AGENT_INFO.find((a) => a.key === key)?.name ?? "AI agent";
}

export const DEFAULT_AGENT_SETTINGS = { enabled: true, follow_up_days: 3, chat_language: "taglish" };
