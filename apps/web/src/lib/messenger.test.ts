import { createHmac } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { messengerReply, runMessengerTool, toModelMessages, type AssistantResult, type MessengerListing } from "./messenger-assistant";
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
