import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { fillFromPost, toFormValues } from "./post-import";

describe("toFormValues", () => {
  it("maps the AI's answer onto the Add property form", () => {
    expect(
      toFormValues({
        name: "2BR corner unit, Avida Towers",
        type: "condominium",
        location: "Mandaluyong",
        price_php: 4800000,
        reservation_fee_php: 20000,
        pag_ibig: true,
        bank_financing: false,
        downpayment_percent: 20,
        description: "Two bedrooms, 64 square meters.",
      }),
    ).toEqual({
      name: "2BR corner unit, Avida Towers",
      type: "condominium",
      location: "Mandaluyong",
      price: "4800000",
      reservationFee: "20000",
      pagIbig: "on",
      downpaymentPercent: "20",
      description: "Two bedrooms, 64 square meters.",
    });
  });

  it("drops bad values instead of failing", () => {
    expect(
      toFormValues({ name: "  ", type: "castle", price_php: -1, downpayment_percent: 150, location: "Cebu", pag_ibig: "yes" }),
    ).toEqual({ location: "Cebu" });
    expect(toFormValues(null)).toEqual({});
    expect(toFormValues("nonsense")).toEqual({});
  });

  it("caps long text", () => {
    expect(toFormValues({ name: "x".repeat(500) }).name).toHaveLength(160);
  });
});

describe("fillFromPost", () => {
  it("forces the fill_listing tool and wraps the post", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "tool_use", id: "t", name: "fill_listing", input: { price_php: 2500000 } }],
    });
    const out = await fillFromPost({ messages: { create } } as unknown as Anthropic, "m", "FOR SALE lot 2.5M");
    expect(out).toEqual({ price: "2500000" });
    const params = create.mock.calls[0]![0];
    expect(params.tool_choice).toEqual({ type: "tool", name: "fill_listing" });
    expect(params.messages[0].content).toContain("<post>\nFOR SALE lot 2.5M\n</post>");
  });
});
