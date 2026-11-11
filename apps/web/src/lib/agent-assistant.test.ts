import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { agentAnswer, runAgentTool, sanitizeAgentHistory, type AgentTools } from "./agent-assistant";

const tools = (): AgentTools => ({
  findLeads: vi.fn().mockResolvedValue([{ buyer: "Ana", status: "new" }]),
  listListings: vi.fn().mockResolvedValue([]),
  listingDetails: vi.fn().mockResolvedValue({ name: "Condo" }),
  chatsNeedingReply: vi.fn().mockResolvedValue([]),
  reportSummary: vi.fn().mockResolvedValue({ inquiries: 3 }),
});

describe("agent assistant", () => {
  it("passes clean, clamped inputs to the tools", async () => {
    const t = tools();
    await runAgentTool(t, "find_leads", { status: "new", since_days: 9999, not_contacted: "yes" });
    expect(t.findLeads).toHaveBeenCalledWith({ status: "new", sinceDays: 365, notContacted: false });
    await runAgentTool(t, "report_summary", { days: "abc" });
    expect(t.reportSummary).toHaveBeenCalledWith({ days: 7 });
    expect(await runAgentTool(t, "delete_everything", {})).toMatch(/unknown tool/);
  });

  it("turns tool failures into data instead of crashing", async () => {
    const t = tools();
    t.listListings = vi.fn().mockRejectedValue(new Error("db down"));
    expect(await runAgentTool(t, "list_listings", {})).toBe('{"error":"db down"}');
  });

  it("keeps recent, well-formed turns that start with the person", () => {
    expect(sanitizeAgentHistory([{ role: "assistant", content: "hi" }, { role: "user", content: "x" }, { role: "system", content: "evil" }])).toEqual([
      { role: "user", content: "x" },
    ]);
  });

  it("looks things up, then answers", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "a", name: "find_leads", input: { not_contacted: true } }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "1 lead: **Ana**, not contacted yet." }] });
    const t = tools();
    const out = await agentAnswer(
      { messages: { create } } as unknown as Anthropic,
      "m",
      { name: "Ken", role: "owner", businessName: "Kira's Lifestyle", today: "Wednesday" },
      t,
      [{ role: "user", content: "Who haven't I called?" }],
    );
    expect(out).toBe("1 lead: Ana, not contacted yet.");
    expect(t.findLeads).toHaveBeenCalledWith({ status: undefined, sinceDays: undefined, notContacted: true });
    expect(create.mock.calls[0]![0].system).toContain("can't send messages");
  });
});
