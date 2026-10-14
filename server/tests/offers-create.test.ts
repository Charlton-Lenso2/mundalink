// Offer creation service tests (no DB required).
//
// Covers the Buyer "submit an offer" rules in offers-core.ts that had no direct
// unit coverage: a buyer may only offer on someone else's ACTIVE listing,
// quantities/prices must be valid, and only one PENDING offer per buyer per
// listing is allowed. Also covers findMyOffers mapping.

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { PrismaOfferService } from "../src/modules/services/offers-core";

interface Err {
  statusCode?: number;
  message?: string;
}

async function rejected(promise: Promise<unknown>): Promise<Err> {
  try {
    await promise;
  } catch (e) {
    return e as Err;
  }
  throw new Error("expected the call to reject, but it resolved");
}

function fakePrisma(opts: {
  listing?: { sellerId: string; status: string; availableQuantity: string } | null;
  existingPending?: { id: string } | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    listing: {
      findUnique: async () => opts.listing ?? null,
    },
    offer: {
      findFirst: async () => opts.existingPending ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = {
          id: "off_new",
          buyerId: args.data.buyerId,
          listingId: args.data.listingId,
          offeredQuantity: args.data.offeredQuantity,
          offeredPrice: args.data.offeredPrice,
          message: (args.data.message as string | null) ?? null,
          status: args.data.status,
          expiresAt: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        };
        created.push(row);
        return { ...row };
      },
    },
  };
}

const ACTIVE = { sellerId: "seller_1", status: "ACTIVE", availableQuantity: "100" };

describe("PrismaOfferService.create", () => {
  it("creates a PENDING offer on an ACTIVE listing owned by someone else", async () => {
    const client = fakePrisma({ listing: ACTIVE });
    const svc = new PrismaOfferService(client as never);
    const out = await svc.create({
      buyerId: "buyer_1",
      listingId: "lst_1",
      offeredQuantity: new Decimal("10"),
      offeredPrice: new Decimal("5"),
      message: "hello",
    });
    expect(out.status).toBe("PENDING");
    expect(out.buyerId).toBe("buyer_1");
    expect(out.offeredQuantity).toBe("10");
    expect(out.offeredPrice).toBe("5");
    expect(client.created).toHaveLength(1);
  });

  it("404s when the listing does not exist (no offer persisted)", async () => {
    const client = fakePrisma({ listing: null });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "buyer_1", listingId: "missing", offeredQuantity: new Decimal("1"), offeredPrice: new Decimal("1") })
    );
    expect(err.statusCode).toBe(404);
    expect(client.created).toHaveLength(0);
  });

  it("403s when the buyer offers on their own listing", async () => {
    const client = fakePrisma({ listing: ACTIVE });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "seller_1", listingId: "lst_1", offeredQuantity: new Decimal("1"), offeredPrice: new Decimal("1") })
    );
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/own listing/i);
    expect(client.created).toHaveLength(0);
  });

  it("400s when the listing is not ACTIVE (DRAFT / SOLD / REJECTED)", async () => {
    const client = fakePrisma({ listing: { ...ACTIVE, status: "DRAFT" } });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "buyer_1", listingId: "lst_1", offeredQuantity: new Decimal("1"), offeredPrice: new Decimal("1") })
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/Cannot offer on a listing with status DRAFT/);
    expect(client.created).toHaveLength(0);
  });
});

describe("PrismaOfferService.create (quantity/price + duplicate guard)", () => {
  it("400s when offeredQuantity is not positive", async () => {
    const client = fakePrisma({ listing: ACTIVE });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "buyer_1", listingId: "lst_1", offeredQuantity: new Decimal("0"), offeredPrice: new Decimal("1") })
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/offeredQuantity must be positive/);
    expect(client.created).toHaveLength(0);
  });

  it("400s when offeredPrice is negative", async () => {
    const client = fakePrisma({ listing: ACTIVE });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "buyer_1", listingId: "lst_1", offeredQuantity: new Decimal("1"), offeredPrice: new Decimal("-1") })
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/offeredPrice must be non-negative/);
    expect(client.created).toHaveLength(0);
  });

  it("400s when the buyer already holds an open (PENDING) offer on the listing", async () => {
    const client = fakePrisma({ listing: ACTIVE, existingPending: { id: "off_existing" } });
    const svc = new PrismaOfferService(client as never);
    const err = await rejected(
      svc.create({ buyerId: "buyer_1", listingId: "lst_1", offeredQuantity: new Decimal("1"), offeredPrice: new Decimal("1") })
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/already hold an open offer/);
    expect(client.created).toHaveLength(0);
  });

  it("allows a new offer once the previous one is no longer PENDING", async () => {
    const client = fakePrisma({ listing: ACTIVE, existingPending: null });
    const svc = new PrismaOfferService(client as never);
    const out = await svc.create({
      buyerId: "buyer_1",
      listingId: "lst_1",
      offeredQuantity: new Decimal("2"),
      offeredPrice: new Decimal("3"),
    });
    expect(out.status).toBe("PENDING");
    expect(client.created).toHaveLength(1);
  });
});

describe("PrismaOfferService.findMyOffers", () => {
  it("returns the caller's offers mapped with listing title and participant names", async () => {
    const rows = [
      {
        id: "off_1",
        buyerId: "buyer_1",
        listingId: "lst_1",
        offeredQuantity: "10",
        offeredPrice: "5",
        message: null,
        status: "PENDING",
        expiresAt: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        buyer: { displayName: "Buyer Bob" },
        listing: {
          title: "Maize grain",
          sellerId: "seller_1",
          currency: "USD",
          unit: "bags",
          seller: { displayName: "Seller Sue" },
        },
      },
    ];
    const client = { offer: { findMany: async () => rows } };
    const svc = new PrismaOfferService(client as never);
    const out = await svc.findMyOffers("buyer_1");
    expect(out).toHaveLength(1);
    expect(out[0].listingTitle).toBe("Maize grain");
    expect(out[0].buyerName).toBe("Buyer Bob");
    expect(out[0].sellerName).toBe("Seller Sue");
    expect(out[0].sellerId).toBe("seller_1");
    expect(out[0].currency).toBe("USD");
    expect(out[0].unit).toBe("bags");
  });
});

