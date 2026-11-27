import { describe, expect, it } from "vitest";
import {
  bitsApart,
  fingerprint,
  median,
  payFirstWording,
  placeWords,
  priceFarBelow,
  sameArea,
  sharedPhotos,
} from "./listing-checks";

describe("payFirstWording", () => {
  it("notices wording that asks for money before a viewing", () => {
    for (const text of [
      "Clean title. Reservation fee before viewing, no exceptions.",
      "Bayad muna bago viewing para sure buyer.",
      "Before the site visit, please send the deposit to hold the unit.",
      "Padala muna ng dp bago tripping",
      "No viewing until the holding fee is paid.",
      "Walang viewing, rush sale.",
    ]) {
      expect(payFirstWording(text), text).not.toBeNull();
    }
  });

  it("notices ways to pay that can't be traced, and a wallet number in the listing", () => {
    expect(payFirstWording("Payment by Western Union only")).toBe(
      "western union",
    );
    expect(payFirstWording("Accepting USDT or Bitcoin")).not.toBeNull();
    expect(payFirstWording("Reserve now! GCash 0917 123 4567")).toContain(
      "gcash",
    );
    expect(payFirstWording("Send to Maya: +63 918-555-0000 today")).toContain(
      "maya",
    );
  });

  it("leaves ordinary listings alone", () => {
    for (const text of [
      "3 bedrooms, 2 baths. Reservation fee ₱25,000. Bank and Pag-IBIG financing accepted.",
      "Viewing by appointment. Call before you visit so we can open the gate.",
      "Free tripping every weekend. Downpayment payable in 12 months.",
      "Pay your reservation fee after viewing, at the developer's office.",
      "We accept GCash for the reservation fee at our office.",
      "Clean title, ready for occupancy, near SM City.",
      "",
    ]) {
      expect(payFirstWording(text), text).toBeNull();
    }
  });
});

describe("the price check", () => {
  const M = 100_000_000; // ₱1M in centavos

  it("finds the place names in a location", () => {
    expect(placeWords("Brgy. San Isidro, Jaro, Iloilo City")).toEqual([
      "isidro",
      "jaro",
      "iloilo",
    ]);
    expect(sameArea("Jaro, Iloilo City", "Lapuz, Iloilo")).toBe(true);
    expect(sameArea("Pototan, Iloilo", "Pasig City, Metro Manila")).toBe(false);
    expect(sameArea("Quezon City", "Cebu City")).toBe(false);
  });

  it("takes the middle price", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });

  it("flags a price far under similar listings, once there are enough to compare", () => {
    expect(priceFarBelow(1 * M, [4 * M, 5 * M, 6 * M])).toEqual({
      usual: 5 * M,
      percent: 20,
      count: 3,
    });
    expect(priceFarBelow(2 * M, [4 * M, 5 * M, 6 * M])).toBeNull();
    expect(priceFarBelow(1 * M, [4 * M, 5 * M])).toBeNull();
  });

  it("flags any price under ₱50,000, with or without listings to compare", () => {
    expect(priceFarBelow(4_999_999, [])).toEqual({
      usual: null,
      percent: null,
      count: 0,
    });
    expect(priceFarBelow(5_000_000, [])).toBeNull();
  });
});

describe("photo fingerprints", () => {
  /** A 9 by 8 picture from a function of column and row. */
  const picture = (f: (col: number, row: number) => number) =>
    Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
  const house = picture(
    (c, r) => ((c * 37 + r * 91) % 13) * 19 + (r % 2 ? c * 3 : 0),
  );

  it("are the same for a brighter or slightly noisy copy, and different for another picture", () => {
    const a = fingerprint(house)!;
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint(house.map((v) => v + 20))).toBe(a);
    const noisy = fingerprint(house.map((v, i) => v + (i % 7 === 0 ? 1 : 0)))!;
    expect(bitsApart(a, noisy)).toBeLessThanOrEqual(4);
    const other = fingerprint(
      picture((c, r) => ((c * 11 + r * 53) % 17) * 13),
    )!;
    expect(bitsApart(a, other)).toBeGreaterThan(10);
  });

  it("are skipped for a picture with almost nothing in it", () => {
    expect(fingerprint(picture(() => 255))).toBeNull();
    expect(fingerprint(picture((c) => 200 - c))).toBeNull();
    expect(fingerprint([1, 2, 3])).toBeNull();
  });

  it("count differing bits", () => {
    expect(bitsApart("0000000000000000", "0000000000000000")).toBe(0);
    expect(bitsApart("0000000000000000", "000000000000000f")).toBe(4);
    expect(bitsApart("ffffffffffffffff", "0000000000000000")).toBe(64);
  });

  it("name another seller's listing only when enough photos match", () => {
    const mine = ["aaaaaaaaaaaaaaaa", "5555555555555555", "0f0f0f0f0f0f0f0f"];
    const others = [
      { property_id: "copy", hash: "aaaaaaaaaaaaaaab" },
      { property_id: "copy", hash: "5555555555555555" },
      { property_id: "clubhouse", hash: "0f0f0f0f0f0f0f0f" },
      { property_id: "unrelated", hash: "ffff0000ffff0000" },
    ];
    expect(sharedPhotos(mine, others)).toEqual([
      { property_id: "copy", shared: 2 },
    ]);
    expect(sharedPhotos(["0f0f0f0f0f0f0f0f"], others)).toEqual([]);
    expect(sharedPhotos(["0f0f0f0f0f0f0f0f"], others, 1)).toEqual([
      { property_id: "clubhouse", shared: 1 },
    ]);
    expect(sharedPhotos([], others)).toEqual([]);
  });
});
