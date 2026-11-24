import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => null }));

const { commitDeals } = await import("./messenger-jobs");

const listing = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "3BR house",
  type: "house_and_lot",
  location: "Pototan",
  status: "available",
  price_minor: 300000000,
  reservation_fee_minor: null,
  description: null,
  financing: null,
};
const turn = () => ({
  result: {
    reply:
      "Congrats po!\n\n✅ Naitala na ang deal: ₱2,900,000 para sa 3BR house. Reference no. HSE2B7KQ. Ipapadala ng agent dito ang reservation agreement.",
    offers: [
      {
        listingId: listing.id,
        amountMinor: 290000000,
        counterMinor: null,
        outcome: "accepted" as const,
        ref: "HSE2B7KQ",
      },
    ],
  },
  props: [listing],
  language: "taglish" as const,
});
const admin = (res: { data: unknown; error: { message: string } | null }) =>
  ({ rpc: vi.fn().mockResolvedValue(res) }) as never;

describe("a deal the AI agreed", () => {
  it("is recorded before the buyer sees the confirmation", async () => {
    const t = turn();
    const db = admin({ data: "offer-id", error: null });
    await commitDeals(db, "conv-1", t);
    expect(
      (db as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith(
      "record_offer",
      expect.objectContaining({
        p_outcome: "accepted",
        p_ref: "HSE2B7KQ",
        p_amount: 290000000,
      }),
    );
    expect(t.result.reply).toContain("Reference no. HSE2B7KQ");
    expect(t).toMatchObject({ deal: { agreed: { ref: "HSE2B7KQ" } } });
  });

  it("refused by the database never reaches the buyer as a deal", async () => {
    const t = turn();
    await commitDeals(
      admin({ data: null, error: { message: "deal_taken" } }),
      "conv-1",
      t,
    );
    expect(t.result.reply).toBe(
      "Salamat po! Kukumpirmahin ng agent ang offer ninyo dito sa lalong madaling panahon.",
    );
    expect(t.result.reply).not.toContain("Reference");
    expect((t.result as { handover?: string }).handover).toContain(
      "another buyer's deal on this listing came first",
    );
  });
});
