import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { draftReply, summarize, transcript, translate } from "./reply-helper";

const client = (response: unknown) => {
  const create = vi.fn().mockResolvedValue(response);
  return { c: { messages: { create } } as unknown as Anthropic, create };
};

describe("reply helper", () => {
  it("labels who said what", () => {
    expect(transcript([{ from: "buyer", text: "Hi\npo" }, { from: "ai", text: "Hello" }, { from: "page", text: "Kira here" }])).toBe(
      "Buyer: Hi po\nAI assistant: Hello\nAgent (Facebook inbox): Kira here",
    );
  });

  it("returns a tidy summary from the forced tool", async () => {
    const { c, create } = client({
      content: [{ type: "tool_use", id: "t", name: "summary", input: { points: ["Wants a 2BR", 42], next_step: "Confirm Saturday", language: "Taglish" } }],
    });
    expect(await summarize(c, "m", [{ from: "buyer", text: "2BR po?" }])).toEqual({ points: ["Wants a 2BR"], nextStep: "Confirm Saturday", language: "Taglish" });
    expect(create.mock.calls[0]![0].tool_choice).toEqual({ type: "tool", name: "summary" });
  });

  it("drafts around the agent's notes and strips wrapping quotes", async () => {
    const { c, create } = client({ content: [{ type: "text", text: '"Sure po, Saturday 10 AM works!"' }] });
    const out = await draftReply(c, "m", { businessName: "Kira's Lifestyle", agentName: "Ken", turns: [{ from: "buyer", text: "Sat?" }], listings: [], notes: "sat 10am ok" });
    expect(out).toBe("Sure po, Saturday 10 AM works!");
    expect(create.mock.calls[0]![0].messages[0].content).toContain("<agent_notes>\nsat 10am ok");
  });

  it("translates to the requested language", async () => {
    const { c, create } = client({ content: [{ type: "text", text: "Available pa po." }] });
    expect(await translate(c, "m", "It's still available.", "fil")).toBe("Available pa po.");
    expect(create.mock.calls[0]![0].system).toContain("Filipino");
  });
});
