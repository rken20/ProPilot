import type Anthropic from "@anthropic-ai/sdk";
import { amortize } from "@propilot/shared";
import type { Listing } from "./listings";
import { formatPeso } from "./money";

/**
 * The buyer-facing listing assistant. It answers only from the listing record,
 * hands anything else to the agent, and never does loan math itself: the
 * `estimate_monthly_payment` tool runs the shared calculator.
 */

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const MAX_TURNS = 12;
export const MAX_MESSAGE_CHARS = 600;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export function listingFacts(l: Listing): string {
  const f = l.financing ?? {};
  const lines = [
    `Name: ${l.name}`,
    `Type: ${l.type.replace(/_/g, " ")}`,
    `Location: ${l.location}`,
    `Status: ${l.status}`,
    `Selling price: ${formatPeso(l.price_minor, l.currency)}`,
    `Reservation fee: ${l.reservation_fee_minor === null ? "not stated" : formatPeso(l.reservation_fee_minor, l.currency)}`,
    `Financing options: ${
      [f.bankFinancing && "bank financing", f.pagIbig && "Pag-IBIG", f.inHouse && "in-house financing"].filter(Boolean).join(", ") ||
      "not stated"
    }`,
    `Required downpayment: ${f.downpaymentPercent === undefined ? "not stated" : `${f.downpaymentPercent}%`}`,
    `Financing notes from the agent: ${f.notes || "none"}`,
    `Listed by: ${l.business_name}`,
    `Description from the agent: ${l.description || "none"}`,
  ];
  return lines.join("\n");
}

export function systemPrompt(l: Listing): string {
  return `You are ProPilot's listing assistant, helping a home buyer in the Philippines with one property listing.

Answer ONLY from the listing facts below. They were written by the listing agent.
- If a fact is "not stated" or missing (for example floor area, parking, association dues, turnover date, interest rates), say plainly that the listing doesn't say, and suggest the buyer ask the agent through "Request a viewing". Never guess, estimate, or use outside knowledge about the property, the developer, or the area.
- For monthly payments, always call the estimate_monthly_payment tool. Never calculate payments yourself. Interest rates are not in the listing: if the buyer hasn't given a rate and term, ask for them (you may mention that rates vary by lender and they should confirm with their bank or Pag-IBIG). Always present the result as an estimate, not an offer.
- Do not give legal, tax, or investment advice. Do not promise discounts, availability, or approvals.
- Keep answers short: 1 to 4 plain sentences. No dashes, and no sales words such as "stunning", "nestled" or "dream home". Reply in the language the buyer writes in (English, Filipino, or Hiligaynon are all fine).
- Prices are in Philippine pesos (₱).

<listing>
${listingFacts(l)}
</listing>`;
}

export const tools: Anthropic.Tool[] = [
  {
    name: "estimate_monthly_payment",
    description:
      "Estimate the monthly loan payment for this listing's selling price. Use only rates and terms the buyer provided, or the downpayment stated in the listing.",
    input_schema: {
      type: "object",
      properties: {
        downpayment_percent: { type: "number", description: "Downpayment as a percent of the price, 0–100" },
        annual_rate_percent: { type: "number", description: "Annual interest rate in percent, e.g. 6.5" },
        years: { type: "number", description: "Loan term in years, 1–40" },
      },
      required: ["downpayment_percent", "annual_rate_percent", "years"],
    },
  },
];

export function runTool(l: Listing, name: string, input: unknown): string {
  if (name !== "estimate_monthly_payment") return JSON.stringify({ error: "unknown tool" });
  const i = (input ?? {}) as Record<string, unknown>;
  try {
    const r = amortize({
      priceMinor: l.price_minor,
      downpaymentPercent: Number(i.downpayment_percent),
      annualRatePercent: Number(i.annual_rate_percent),
      years: Number(i.years),
    });
    return JSON.stringify({
      price: formatPeso(l.price_minor),
      downpayment: formatPeso(r.downpaymentMinor),
      loan_amount: formatPeso(r.loanMinor),
      monthly_payment: formatPeso(r.monthlyMinor),
      months: r.months,
      total_interest: formatPeso(r.totalInterestMinor),
      note: "Estimate only. Actual terms depend on the lender.",
    });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "invalid input" });
  }
}

/** Keep only well-formed, recent turns that start with the buyer. */
export function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_TURNS);
  while (msgs.length && msgs[0]!.role !== "user") msgs.shift();
  return msgs;
}

type Client = Pick<Anthropic, "messages">;

/** One buyer turn: call the model, run any tool calls (up to 3 rounds), return the reply text. */
export async function answer(client: Client, model: string, l: Listing, history: ChatMessage[]): Promise<string> {
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  for (let round = 0; round < 4; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: 400,
      system: systemPrompt(l),
      tools,
      messages,
    });
    if (res.stop_reason === "tool_use" && round < 3) {
      const results: Anthropic.ToolResultBlockParam[] = res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ type: "tool_result", tool_use_id: b.id, content: runTool(l, b.name, b.input) }));
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: results });
      continue;
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || "I couldn't find that in the listing. Please ask the agent through Request a viewing.";
  }
  return "Sorry, I couldn't work that out. Please ask the agent through Request a viewing.";
}
