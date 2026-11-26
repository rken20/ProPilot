import { describe, expect, it } from "vitest";
import { MAX_VIDEO_CAPTION, videoCaption } from "./caption";
import type { AdListing } from "./spec";

const house: AdListing = {
  name: "3BR House, Lanag",
  typeLabel: "House and lot",
  location: "Barangay Lanag, Pototan, Iloilo",
  price: "₱2,500,000",
  priceMinor: 250_000_000,
  status: "available",
  reservationFee: "₱20,000",
  downpaymentPercent: 20,
  financing: ["Bank financing", "Pag-IBIG"],
  description: "",
  business: "Santos Realty",
};
const text = {
  hook: "Hanap mo ba ay bahay sa Pototan?",
  lines: ["3 bedrooms", "Covered garage"],
  cta: "I-message kami para mag-viewing",
};

describe("the caption posted with a video ad", () => {
  it("is the ad's words, the listing's price, place and terms, and the listing's link", () => {
    expect(videoCaption(text, house, "https://myhomeseller.ai/l/abc")).toBe(
      [
        "Hanap mo ba ay bahay sa Pototan?",
        "• 3 bedrooms\n• Covered garage",
        "₱2,500,000 · Pototan, Iloilo · Bank financing · Pag-IBIG · Reservation ₱20,000 · 20% downpayment",
        "I-message kami para mag-viewing\nhttps://myhomeseller.ai/l/abc",
      ].join("\n\n"),
    );
  });

  it("leaves out what isn't there, says when the listing is reserved, and stays within Facebook's room", () => {
    const bare = videoCaption(
      { hook: "Lot in Dauis", lines: [], cta: "" },
      {
        ...house,
        status: "reserved",
        financing: [],
        reservationFee: null,
        downpaymentPercent: null,
      },
      null,
    );
    expect(bare).toBe(
      "Lot in Dauis\n\n₱2,500,000 (reserved) · Pototan, Iloilo",
    );
    expect(
      videoCaption({ ...text, hook: "x".repeat(3000) }, house, null),
    ).toHaveLength(MAX_VIDEO_CAPTION);
  });
});
