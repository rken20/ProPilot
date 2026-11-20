import { createHmac } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { messengerReply, messengerSystemPrompt, runMessengerTool, toModelMessages, type AssistantResult, type MessengerListing } from "./messenger-assistant";
import { parseWebhook, verifyWebhookSignature } from "./meta";

const listing: MessengerListing = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "2BR corner unit",
  type: "condominium",
  location: "Mandaluyong",
  status: "available",
  price_minor: 480000000,
  reservation_fee_minor: 2000000,
  description: "64 sqm, one parking slot.",
  financing: { pagIbig: true },
};

describe("webhook signature", () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  const sig = `sha256=${createHmac("sha256", "shh").update(body).digest("hex")}`;
  it("accepts Meta's signature and rejects anything else", () => {
    expect(verifyWebhookSignature(body, sig, "shh")).toBe(true);
    expect(verifyWebhookSignature(body, sig, "other")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sig, "shh")).toBe(false);
    expect(verifyWebhookSignature(body, null, "shh")).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", "shh")).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("reads buyer messages, attachments, postbacks and echoes", () => {
    const events = parseWebhook({
      object: "page",
      entry: [
        {
          id: "1001",
          messaging: [
            { sender: { id: "777" }, recipient: { id: "1001" }, timestamp: 1, message: { mid: "m1", text: "Available pa po?" } },
            { sender: { id: "777" }, recipient: { id: "1001" }, timestamp: 2, message: { mid: "m2", attachments: [{ type: "image" }] } },
            { sender: { id: "777" }, recipient: { id: "1001" }, timestamp: 3, postback: { title: "Get started" } },
            { sender: { id: "1001" }, recipient: { id: "777" }, timestamp: 4, message: { mid: "m3", text: "Hi, Kira here", is_echo: true, app_id: 26390203743090 } },
            { sender: { id: "777" }, recipient: { id: "1001" }, timestamp: 5, read: { watermark: 1 } },
          ],
        },
      ],
    });
    expect(events.map((e) => [e.psid, e.text ?? e.attachment ?? e.postback, e.echo?.appId])).toEqual([
      ["777", "Available pa po?", undefined],
      ["777", "image", undefined],
      ["777", "Get started", undefined],
      ["777", "Hi, Kira here", "26390203743090"],
    ]);
  });

  it("ignores other objects and malformed ids", () => {
    expect(parseWebhook({ object: "instagram", entry: [] })).toEqual([]);
    expect(parseWebhook({ object: "page", entry: [{ id: "x", messaging: [{}] }] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe("chat language", () => {
  it("writes in Taglish unless the business chose English", () => {
    const base = messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20");
    expect(base).toContain("Write in Taglish");
    expect(messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20", { language: "taglish" })).toBe(base);
    const english = messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20", { language: "english" });
    expect(english).toContain("Write in English only");
    expect(english).not.toContain("Taglish");
  });
});

describe("Messenger tools", () => {
  it("saves a viewing request only with a name and a real-looking number", () => {
    const r: AssistantResult = { reply: "" };
    expect(runMessengerTool([listing], "save_viewing_request", { name: "Ana", mobile: "call me" }, r)).toMatch(/doesn't look right/);
    expect(r.viewing).toBeUndefined();
    runMessengerTool([listing], "save_viewing_request", { name: "Ana Reyes", mobile: "0917 123 4567", listing_id: listing.id, preferred_date: "2026-11-15" }, r);
    expect(r.viewing).toEqual({ name: "Ana Reyes", phone: "0917 123 4567", listingId: listing.id, preferredDate: "2026-11-15", notes: undefined });
  });

  it("only knows the business's own listings", () => {
    const r: AssistantResult = { reply: "" };
    expect(runMessengerTool([listing], "get_listing_details", { listing_id: "someone-elses" }, r)).toMatch(/No listing/);
    expect(runMessengerTool([listing], "get_listing_details", { listing_id: listing.id }, r)).toContain("Reservation fee: ₱20,000");
  });

  it("uses the shared calculator for payments", () => {
    const out = JSON.parse(
      runMessengerTool([listing], "estimate_monthly_payment", { listing_id: listing.id, downpayment_percent: 20, annual_rate_percent: 6.25, years: 25 }, { reply: "" }),
    );
    expect(out.monthly_payment).toMatch(/25,331/);
  });

  it("records a handover", () => {
    const r: AssistantResult = { reply: "" };
    runMessengerTool([listing], "hand_to_agent", { reason: "Wants to negotiate" }, r);
    expect(r.handover).toBe("Wants to negotiate");
  });
});

describe("negotiation", () => {
  // Asking ₱4,800,000; the owner would take ₱4,400,000.
  const floors = { [listing.id]: 440000000 };
  const check = (amount: number, r: AssistantResult, prior: Array<{ listingId: string; outcome: "too_low" | "countered" | "pending"; amountMinor: number }> = []) =>
    runMessengerTool([listing], "check_offer", { listing_id: listing.id, amount_php: amount, name: "Ana" }, r, { floors, prior });

  it("is only in the prompt and the tools when the plan includes it", async () => {
    const off = messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20");
    expect(off).toContain("want to negotiate price or terms");
    expect(off).not.toContain("check_offer");
    const on = messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20", { negotiate: true });
    expect(on).toContain("check_offer");
    expect(on).toContain("You can't accept a price");
    expect(runMessengerTool([listing], "check_offer", { listing_id: listing.id, amount_php: 4500000 }, { reply: "" })).toMatch(/unknown tool/);

    const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const ctx = { pageName: "Santos Realty", listings: [listing], history: [{ from: "buyer" as const, text: "4.5M?" }], today: "2026-11-20" };
    await messengerReply({ messages: { create } } as unknown as Anthropic, "m", ctx);
    await messengerReply({ messages: { create } } as unknown as Anthropic, "m", { ...ctx, negotiation: { floors, prior: [] } });
    const names = (n: number) => (create.mock.calls[n]![0] as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names(0)).not.toContain("check_offer");
    expect(names(1)).toContain("check_offer");
  });

  it("never tells the AI the owner's lowest price", () => {
    const prompt = messengerSystemPrompt("Santos Realty", [listing], false, "2026-11-20", { negotiate: true });
    const outputs = [4000000, 4300000, 4450000, 4800000].map((a) => check(a, { reply: "" }));
    for (const text of [prompt, ...outputs]) {
      expect(text).not.toContain("4,400,000");
      expect(text).not.toContain("440000000");
    }
  });

  it("turns down a low offer, asks once for more on a fair one, then sends it to the owner", () => {
    const r: AssistantResult = { reply: "" };
    expect(JSON.parse(check(4000000, r)).status).toBe("too_low");
    expect(r.offers).toEqual([{ listingId: listing.id, amountMinor: 400000000, counterMinor: null, outcome: "too_low", name: "Ana" }]);
    expect(r.handover).toBeUndefined();

    // ₱4,500,000 is acceptable: the AI asks for the midpoint with ₱4,800,000 first.
    const ask = JSON.parse(check(4500000, r));
    expect(ask.status).toBe("ask_for_more");
    expect(ask.say).toContain("₱4,650,000");
    expect(r.offers!.at(-1)).toMatchObject({ outcome: "countered", counterMinor: 465000000 });

    // Their final offer goes to the owner, and the AI says it isn't final.
    const sent = JSON.parse(check(4500000, r));
    expect(sent.status).toBe("sent_to_owner");
    expect(sent.say).toContain("isn't final until the owner confirms");
    expect(r.offers!.at(-1)).toMatchObject({ outcome: "pending", amountMinor: 450000000 });
    // A fourth try in the same chat changes nothing.
    expect(JSON.parse(check(4400000, r)).status).toBe("with_owner");
    expect(r.offers).toHaveLength(3);
  });

  it("hands over to a person after three low offers, counting earlier ones", () => {
    const r: AssistantResult = { reply: "" };
    const earlier = [
      { listingId: listing.id, outcome: "too_low" as const, amountMinor: 380000000 },
      { listingId: listing.id, outcome: "too_low" as const, amountMinor: 400000000 },
    ];
    expect(JSON.parse(check(4200000, r, earlier)).say).toContain("an agent will reply");
    expect(r.handover).toContain("stopped negotiating");
  });

  it("doesn't negotiate a listing with no lowest price, or one that's reserved", () => {
    const r: AssistantResult = { reply: "" };
    expect(JSON.parse(runMessengerTool([listing], "check_offer", { listing_id: listing.id, amount_php: 4500000 }, r, { floors: {}, prior: [] })).status).toBe("handed_to_agent");
    expect(r.handover).toContain("No lowest price is set");
    expect(r.offers).toBeUndefined();
    const reserved = { ...listing, status: "reserved" };
    expect(JSON.parse(runMessengerTool([reserved], "check_offer", { listing_id: listing.id, amount_php: 4500000 }, { reply: "" }, { floors, prior: [] })).status).toBe("not_open");
  });
});

describe("toModelMessages", () => {
  it("starts with the buyer, merges runs, and marks team replies", () => {
    expect(
      toModelMessages([
        { from: "ai", text: "Hello" },
        { from: "buyer", text: "Hi" },
        { from: "buyer", text: "Price?" },
        { from: "agent", text: "₱4.8M" },
      ]),
    ).toEqual([
      { role: "user", content: "Hi\n\nPrice?" },
      { role: "assistant", content: "[A person from the team wrote:] ₱4.8M" },
    ]);
  });
});

describe("messengerReply", () => {
  it("runs tools, then returns the reply and the handover", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "hand_to_agent", input: { reason: "Asked for a discount" } }],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "I've passed this to an agent." }] });
    const r = await messengerReply({ messages: { create } } as unknown as Anthropic, "m", {
      pageName: "Kira's Lifestyle",
      listings: [listing],
      history: [{ from: "buyer", text: "Can you lower the price?" }],
      today: "2026-11-11",
    });
    expect(r).toEqual({ reply: "I've passed this to an agent.", handover: "Asked for a discount" });
    expect(create.mock.calls[0]![0].system).toContain("automated assistant");
  });
});
