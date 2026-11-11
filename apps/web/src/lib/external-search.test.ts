import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { searchOtherSites } = await import("./external-search");

const searchResult = (urls: string[]) => ({
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_1",
  content: urls.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "x", page_age: null })),
});
const report = (listings: unknown[]) => ({ type: "tool_use", id: "toolu_1", name: "report_listings", input: { listings } });

function fakeClient(responses: Array<{ content: unknown[]; stop_reason: string }>) {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

const filters = { q: "Mandaluyong", type: "condominium", maxPriceMinor: 600000000 };

describe("searchOtherSites", () => {
  it("sends the allowed sites and returns only listings the search really returned", async () => {
    const { client, create } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          searchResult(["https://www.lamudi.com.ph/property/1"]),
          report([
            { url: "https://www.lamudi.com.ph/property/1", title: "2BR condo", price_php: 4800000 },
            { url: "https://www.lamudi.com.ph/property/404", title: "Invented" },
          ]),
        ],
      },
    ]);
    const out = await searchOtherSites(client, "m", filters);
    expect(out.map((l) => l.title)).toEqual(["2BR condo"]);

    const params = create.mock.calls[0]![0];
    const web = params.tools.find((t: { name: string }) => t.name === "web_search");
    expect(web.allowed_domains).toContain("lamudi.com.ph");
    expect(web.allowed_domains).not.toContain("facebook.com");
    expect(web.max_uses).toBe(3);
    expect(params.messages[0].content).toContain("Mandaluyong");
  });

  it("continues after a paused turn and asks for the report if it's missing", async () => {
    const { client, create } = fakeClient([
      { stop_reason: "pause_turn", content: [searchResult(["https://www.dotproperty.com.ph/ads/7"])] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "I found one." }] },
      { stop_reason: "tool_use", content: [report([{ url: "https://www.dotproperty.com.ph/ads/7", title: "Townhouse" }])] },
    ]);
    const out = await searchOtherSites(client, "m", filters);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source_name: "Dot Property" });
    expect(create).toHaveBeenCalledTimes(3);
    const last = create.mock.calls[2]![0].messages.at(-1);
    expect(last.content).toMatch(/report_listings/);
  });

  it("gives up after a few rounds", async () => {
    const { client } = fakeClient(Array.from({ length: 4 }, () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "hm" }] })));
    expect(await searchOtherSites(client, "m", filters)).toEqual([]);
  });
});
