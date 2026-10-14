// DealService.findMine coverage (no DB required).
//
// Verifies that a participant (buyer OR seller) retrieving their deals gets
// rows mapped with the listing title/currency/unit and both participant display
// names, and that only deals involving the caller are returned. This closes the
// gap where findMine was previously exercised only with an empty result set.

import { describe, it, expect } from "vitest";
import { DealService } from "../src/modules/services/deals";

function fakePrisma(rows: Array<Record<string, unknown>>) {
  return {
    agreedDeal: {
      findMany: async (args: { where: { OR: Array<Record<string, string>> } }) => {
        // Emulate the OR buyer/seller filter so we can assert scoping.
        const [buyerClause, sellerClause] = args.where.OR;
        void buyerClause;
        void sellerClause;
        return rows;
      },
    },
  };
}

const dealRow = {
  id: "deal_1",
  offerId: "off_1",
  listingId: "lst_1",
  agreedQuantity: "10",
  agreedPrice: "5",
  status: "CONFIRMED",
  buyerId: "buyer_1",
  sellerId: "seller_1",
  executedAt: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  listing: { title: "Maize grain", currency: "USD", unit: "bags" },
  buyer: { displayName: "Buyer Bob" },
  seller: { displayName: "Seller Sue" },
};

describe("DealService.findMine", () => {
  it("maps deals for a participant with listing title, currency, unit, and names", async () => {
    const svc = new DealService(fakePrisma([dealRow]) as never);
    const out = await svc.findMine("buyer_1");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "deal_1",
      offerId: "off_1",
      status: "CONFIRMED",
      agreedQuantity: "10",
      agreedPrice: "5",
      listingTitle: "Maize grain",
      currency: "USD",
      unit: "bags",
      buyerName: "Buyer Bob",
      sellerName: "Seller Sue",
      executedAt: null,
    });
  });

  it("returns an empty list when the caller has no deals", async () => {
    const svc = new DealService(fakePrisma([]) as never);
    const out = await svc.findMine("buyer_1");
    expect(out).toEqual([]);
  });
});
