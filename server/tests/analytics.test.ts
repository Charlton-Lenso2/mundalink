// Analytics summary tests: every figure must come from stored data.

import { describe, it, expect } from "vitest";
import { AnalyticsService } from "../src/modules/services/analytics";

function fakePrisma() {
  return {
    listing: {
      groupBy: async () => [
        { status: "ACTIVE", _count: { _all: 3 } },
        { status: "DRAFT", _count: { _all: 2 } },
      ],
    },
    offer: {
      groupBy: async () => [{ status: "PENDING", _count: { _all: 4 } }],
    },
    agreedDeal: {
      groupBy: async () => [
        { status: "PENDING", _count: { _all: 1 } },
        { status: "COMPLETED", _count: { _all: 2 } },
      ],
      findMany: async () => [
        { agreedQuantity: "10", agreedPrice: "100.5", listing: { currency: "USD" } },
        { agreedQuantity: "2.5", agreedPrice: "40", listing: { currency: "USD" } },
        { agreedQuantity: "7", agreedPrice: "12", listing: { currency: "ZWL" } },
      ],
    },
    profile: {
      count: async () => 6,
      groupBy: async () => [
        { role: "OBSERVER", _count: { _all: 2 } },
        { role: "SELLER", _count: { _all: 3 } },
        { role: "ADMIN", _count: { _all: 1 } },
      ],
    },
  };
}

describe("AnalyticsService.summary", () => {
  it("aggregates listing/offer/deal counts and per-currency deal value from stored rows", async () => {
    const svc = new AnalyticsService(fakePrisma() as never);
    const summary = await svc.summary();

    expect(summary.listings.byStatus).toEqual({ ACTIVE: 3, DRAFT: 2 });
    expect(summary.offers.byStatus).toEqual({ PENDING: 4 });
    expect(summary.deals.byStatus).toEqual({ PENDING: 1, COMPLETED: 2 });

    // Decimal math: 10*100.5 + 2.5*40 = 1105 USD; 7*12 = 84 ZWL. No float drift.
    expect(summary.deals.agreedValueByCurrency).toEqual({
      USD: "1105.000000",
      ZWL: "84.000000",
    });

    expect(summary.profiles).toEqual({
      total: 6,
      byRole: { OBSERVER: 2, SELLER: 3, ADMIN: 1 },
    });
    expect(Number.isNaN(Date.parse(summary.generatedAt))).toBe(false);
  });

  it("returns zeroed aggregates when the database is empty", async () => {
    const empty = {
      listing: { groupBy: async () => [] },
      offer: { groupBy: async () => [] },
      agreedDeal: { groupBy: async () => [], findMany: async () => [] },
      profile: { count: async () => 0, groupBy: async () => [] },
    };
    const svc = new AnalyticsService(empty as never);
    const summary = await svc.summary();

    expect(summary.listings.byStatus).toEqual({});
    expect(summary.deals.agreedValueByCurrency).toEqual({});
    expect(summary.profiles).toEqual({ total: 0, byRole: {} });
  });

  it("falls back to USD when a listing has no currency stored", async () => {
    const client = {
      listing: { groupBy: async () => [] },
      offer: { groupBy: async () => [] },
      agreedDeal: {
        groupBy: async () => [{ status: "PENDING", _count: { _all: 1 } }],
        findMany: async () => [
          { agreedQuantity: "1", agreedPrice: "5", listing: { currency: null as string | null } },
        ],
      },
      profile: { count: async () => 0, groupBy: async () => [] },
    };
    const svc = new AnalyticsService(client as never);
    const summary = await svc.summary();
    expect(summary.deals.agreedValueByCurrency).toEqual({ USD: "5.000000" });
  });
});
