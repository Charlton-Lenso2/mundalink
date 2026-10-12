// Offer acceptance / decline / withdraw service tests (no DB required).
// Proves: permission gates (owner/buyer only), state gates (PENDING only),
// exactly-one deal per offer (repeat accept -> 409, no second deal), and
// all-or-nothing rollback when the guarded inventory decrement fails.

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { OfferAcceptanceService } from "../src/modules/services/offers-accept";

interface FakeState {
  offer: Record<string, unknown>;
  listing: Record<string, unknown>;
  inventory: Record<string, unknown>;
  deals: Array<Record<string, unknown>>;
}

function makeState(): FakeState {
  return {
    offer: {
      id: "off_1",
      buyerId: "buyer_1",
      listingId: "lst_1",
      offeredQuantity: "5",
      offeredPrice: "100",
      message: null,
      status: "PENDING",
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    listing: {
      id: "lst_1",
      sellerId: "seller_1",
      status: "ACTIVE",
      availableQuantity: "10",
    },
    inventory: { listingId: "lst_1", availableQuantity: "10" },
    deals: [],
  };
}

function fakePrisma(state: FakeState) {
  let transactionTail: Promise<void> = Promise.resolve();
  const client = {
    offer: {
      findUnique: async (args?: { where?: { id?: string } }) => {
        if (args?.where?.id && args.where.id !== state.offer.id) return null;
        return { ...state.offer, listing: { ...state.listing } };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        Object.assign(state.offer, args.data, { updatedAt: new Date() });
        return { ...state.offer };
      },
      updateMany: async (args: {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }) => {
        if (args.where.id !== state.offer.id || args.where.status !== state.offer.status) {
          return { count: 0 };
        }
        Object.assign(state.offer, args.data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
    inventory: {
      updateMany: async (args: {
        where: { availableQuantity?: { gte?: unknown } };
        data: { availableQuantity: { decrement: unknown } };
      }) => {
        const floor = new Decimal(String(args.where.availableQuantity?.gte ?? "0"));
        const available = new Decimal(String(state.inventory.availableQuantity));
        if (available.gte(floor)) {
          state.inventory.availableQuantity = available
            .minus(new Decimal(String(args.data.availableQuantity.decrement)))
            .toString();
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    listing: {
      updateMany: async (args: { data?: { availableQuantity?: { decrement?: unknown } } }) => {
        const dec = args.data?.availableQuantity?.decrement;
        if (dec !== undefined) {
          state.listing.availableQuantity = new Decimal(String(state.listing.availableQuantity))
            .minus(new Decimal(String(dec)))
            .toString();
        }
        return { count: 1 };
      },
    },
    agreedDeal: {
      upsert: async (args: { where: { offerId: string }; create: Record<string, unknown> }) => {
        const existing = state.deals.find((d) => d.offerId === args.where.offerId);
        if (existing) return { ...existing };
        const created = {
          id: `deal_${state.deals.length + 1}`,
          executedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.create,
        };
        state.deals.push(created);
        return { ...created };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      // Model DB semantics: any throw inside the transaction restores the
      // pre-transaction state (rollback) and rethrows.
      const snapshot = structuredClone(state);
      try {
        return await fn(client);
      } catch (err) {
        Object.assign(state, snapshot);
        throw err;
      } finally {
        release();
      }
    },
  };
  return client;
}

interface HttpErr {
  statusCode?: number;
  message?: string;
}

async function rejected(promise: Promise<unknown>): Promise<HttpErr> {
  try {
    await promise;
  } catch (e) {
    return e as HttpErr;
  }
  throw new Error("expected the call to reject, but it resolved");
}

describe("OfferAcceptanceService.accept", () => {
  it("accepts: decrements inventory, creates exactly one deal, marks offer ACCEPTED", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const out = await svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" });

    expect(out.status).toBe("ACCEPTED");
    expect(state.inventory.availableQuantity).toBe("5");
    expect(state.listing.availableQuantity).toBe("5");
    expect(state.deals).toHaveLength(1);
    expect(state.deals[0]).toMatchObject({
      offerId: "off_1",
      buyerId: "buyer_1",
      sellerId: "seller_1",
      status: "PENDING",
      agreedQuantity: "5",
      agreedPrice: "100",
    });
  });

  it("repeat/double accept -> 409, still exactly one deal, no double decrement", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    await svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" });

    const err = await rejected(
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" })
    );
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/Cannot accept an offer in status ACCEPTED/);
    expect(state.deals).toHaveLength(1);
    expect(state.inventory.availableQuantity).toBe("5");
  });

  it("concurrent accept requests for one offer reserve inventory only once", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const results = await Promise.allSettled([
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" }),
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejectedResult = results.find((result) => result.status === "rejected");
    expect(rejectedResult?.status).toBe("rejected");
    if (rejectedResult?.status === "rejected") {
      expect((rejectedResult.reason as HttpErr).statusCode).toBe(409);
    }
    expect(state.inventory.availableQuantity).toBe("5");
    expect(state.listing.availableQuantity).toBe("5");
    expect(state.deals).toHaveLength(1);
  });

  it("rejects a non-owner (non-seller) accept with 403", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "intruder" })
    );
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/listing owner/i);
    expect(state.deals).toHaveLength(0);
    expect(state.offer.status).toBe("PENDING");
    expect(state.inventory.availableQuantity).toBe("10");
  });

  it("rejects an accept whose buyer identity does not match the offer (403)", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(
      svc.accept({ offerId: "off_1", buyerId: "someone_else", sellerId: "seller_1" })
    );
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/buyer mismatch/i);
    expect(state.deals).toHaveLength(0);
  });

  it("rejects acceptance when the listing is not ACTIVE (400)", async () => {
    const state = makeState();
    state.listing.status = "DRAFT";
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" })
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/not active/i);
    expect(state.inventory.availableQuantity).toBe("10");
    expect(state.deals).toHaveLength(0);
  });

  it("rolls back everything when stock is insufficient (409: no decrement, no deal)", async () => {
    const state = makeState();
    state.inventory.availableQuantity = "3";
    state.listing.availableQuantity = "3";
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);

    const err = await rejected(
      svc.accept({ offerId: "off_1", buyerId: "buyer_1", sellerId: "seller_1" })
    );
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/Insufficient inventory/);
    // Full rollback: no partial writes survived the failed transaction.
    expect(state.inventory.availableQuantity).toBe("3");
    expect(state.listing.availableQuantity).toBe("3");
    expect(state.deals).toHaveLength(0);
    expect(state.offer.status).toBe("PENDING");
  });
});

describe("OfferAcceptanceService.decline", () => {
  it("lets the listing owner decline a PENDING offer without touching stock", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const out = await svc.decline("off_1", "seller_1");
    expect(out.status).toBe("DECLINED");
    expect(state.inventory.availableQuantity).toBe("10");
    expect(state.deals).toHaveLength(0);
  });

  it("rejects a non-owner decline with 403", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(svc.decline("off_1", "not_the_seller"));
    expect(err.statusCode).toBe(403);
    expect(state.offer.status).toBe("PENDING");
  });

  it("rejects declining a non-PENDING offer with 400", async () => {
    const state = makeState();
    state.offer.status = "ACCEPTED";
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(svc.decline("off_1", "seller_1"));
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/PENDING/);
    expect(state.offer.status).toBe("ACCEPTED");
  });

  it("404s for an unknown offer", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(svc.decline("missing_offer", "seller_1"));
    expect(err.statusCode).toBe(404);
  });
});

describe("OfferAcceptanceService.withdraw", () => {
  it("rejects withdrawal by someone who is not the offer buyer (403)", async () => {
    const state = makeState();
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(svc.withdraw("off_1", "not_the_buyer"));
    expect(err.statusCode).toBe(403);
    expect(state.offer.status).toBe("PENDING");
  });

  it("rejects withdrawing a non-PENDING offer (400)", async () => {
    const state = makeState();
    state.offer.status = "WITHDRAWN";
    const svc = new OfferAcceptanceService(fakePrisma(state) as never);
    const err = await rejected(svc.withdraw("off_1", "buyer_1"));
    expect(err.statusCode).toBe(400);
    expect(state.offer.status).toBe("WITHDRAWN");
  });
});
