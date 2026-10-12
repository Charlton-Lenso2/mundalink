// Deal fulfilment transition tests (transaction-safe, participant-only).

import { describe, it, expect } from "vitest";
import { DealService } from "../src/modules/services/deals";
import { DEAL_STATUS } from "../src/modules/types/deal";

function fakePrisma(deal: { id: string; buyerId: string; sellerId: string; status: string }) {
  let current = { ...deal };
  const client = {
    agreedDeal: {
      findUnique: async () => ({ ...current }),
      update: async (args: { where: { id: string }; data: { status: string; executedAt?: Date } }) => {
        current = { ...current, status: args.data.status };
        return {
          ...current,
          offerId: "offer-1",
          listingId: "listing-1",
          agreedQuantity: "10",
          agreedPrice: "100",
          executedAt: args.data.executedAt ?? null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        };
      },
      updateMany: async (args: {
        where: { id: string; status: string };
        data: { status: string; executedAt?: Date };
      }) => {
        if (args.where.id !== current.id || args.where.status !== current.status) return { count: 0 };
        current = { ...current, status: args.data.status };
        return { count: 1 };
      },
      findMany: async () => [],
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ agreedDeal: client.agreedDeal }),
  };
  return client;
}

describe("DealService.transition", () => {
  it("moves PENDING -> CONFIRMED for a participant", async () => {
    const svc = new DealService(fakePrisma({ id: "d1", buyerId: "b", sellerId: "s", status: "PENDING" }) as never);
    const out = await svc.transition("d1", "b", DEAL_STATUS.CONFIRMED);
    expect(out.status).toBe("CONFIRMED");
  });

  it("rejects PENDING -> COMPLETED (must confirm first)", async () => {
    const svc = new DealService(fakePrisma({ id: "d1", buyerId: "b", sellerId: "s", status: "PENDING" }) as never);
    await expect(svc.transition("d1", "s", DEAL_STATUS.COMPLETED)).rejects.toThrow(/Cannot move deal/);
  });

  it("rejects outsiders", async () => {
    const svc = new DealService(fakePrisma({ id: "d1", buyerId: "b", sellerId: "s", status: "PENDING" }) as never);
    await expect(svc.transition("d1", "stranger", DEAL_STATUS.CONFIRMED)).rejects.toThrow(/buyer or seller/);
  });

  it("terminal deals never transition", async () => {
    const svc = new DealService(fakePrisma({ id: "d1", buyerId: "b", sellerId: "s", status: "COMPLETED" }) as never);
    await expect(svc.transition("d1", "b", DEAL_STATUS.CANCELLED)).rejects.toThrow(/already COMPLETED/);
  });

  it("allows only one concurrent transition from the same status", async () => {
    const client = fakePrisma({ id: "d1", buyerId: "b", sellerId: "s", status: "PENDING" });
    const svc = new DealService(client as never);
    const results = await Promise.allSettled([
      svc.transition("d1", "b", DEAL_STATUS.CONFIRMED),
      svc.transition("d1", "s", DEAL_STATUS.CANCELLED),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status).toBe("rejected");
    if (failure?.status === "rejected") {
      expect((failure.reason as { statusCode?: number }).statusCode).toBe(409);
    }
  });
});

describe("DealService.history", () => {
  function fakeHistoryPrisma(
    deal: { id: string; buyerId: string; sellerId: string; offerId: string } | null,
    rows: Array<{ id: string; action: string; actorId: string | null; payload: string | null; createdAt: Date }> = []
  ) {
    return {
      agreedDeal: { findUnique: async () => (deal ? { ...deal } : null) },
      auditLog: { findMany: async () => rows },
    };
  }

  const rows = [
    {
      id: "a1",
      action: "OFFER_ACCEPTED",
      actorId: "s",
      payload: '{"listingId":"l1"}',
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "a2",
      action: "DEAL_EXECUTED",
      actorId: "b",
      payload: '{"status":"CONFIRMED"}',
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
  ];

  it("returns audit-sourced entries (payload parsed) for a participant", async () => {
    const svc = new DealService(
      fakeHistoryPrisma({ id: "d1", buyerId: "b", sellerId: "s", offerId: "off_1" }, rows) as never
    );
    const out = await svc.history("d1", "b");
    expect(out).toHaveLength(2);
    expect(out[0].action).toBe("OFFER_ACCEPTED");
    expect(out[1].payload).toEqual({ status: "CONFIRMED" });
    expect(out[0].actorId).toBe("s");
  });

  it("returns an empty history when no events were recorded", async () => {
    const svc = new DealService(
      fakeHistoryPrisma({ id: "d1", buyerId: "b", sellerId: "s", offerId: "off_1" }) as never
    );
    const out = await svc.history("d1", "s");
    expect(out).toEqual([]);
  });

  it("rejects outsiders with 403", async () => {
    const svc = new DealService(
      fakeHistoryPrisma({ id: "d1", buyerId: "b", sellerId: "s", offerId: "off_1" }, rows) as never
    );
    const err = await svc.history("d1", "stranger").catch((e) => e as { statusCode?: number });
    expect(err.statusCode).toBe(403);
    expect(err.message).toMatch(/buyer or seller/);
  });

  it("404s for an unknown deal", async () => {
    const svc = new DealService(fakeHistoryPrisma(null) as never);
    const err = await svc.history("missing", "b").catch((e) => e as { statusCode?: number });
    expect(err.statusCode).toBe(404);
  });
});
