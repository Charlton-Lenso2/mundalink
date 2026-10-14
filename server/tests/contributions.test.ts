// Contribution service tests (in-memory Prisma double — no DB).
//
// Proves: propose is non-binding (inventory/demand untouched); commit is the
// binding step (guarded inventory decrement + guarded demand increment);
// over-demand / over-inventory rejected; duplicate active contribution per
// listing rejected; concurrent commits serialized (exactly one wins);
// duplicate fulfilment rejected; cancel restores inventory + demand;
// FULFILLED requirement only via completed deliveries; cross-user actors
// rejected; failures roll back atomically.
//
// CONCURRENCY NOTE: these "concurrent" tests run two overlapping
// $transaction callbacks against one shared in-memory double with a
// serialized lock (same pattern as tests/offers-accept.test.ts). They prove
// the guarded compare-and-set logic serializes correctly, NOT true
// multi-connection Postgres race behaviour.

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { ContributionService } from "../src/modules/services/contributions";

const BUYER = "buyer_1";
const SELLER = "seller_1";
const SELLER2 = "seller_2";
const OTHER = "intruder";

interface State {
  req: { id: string; buyerId: string; quantity: string; unit: string; status: string };
  agg: { id: string; requirementId: string; committedQuantity: string; status: string };
  listings: Record<string, { id: string; sellerId: string; status: string; availableQuantity: string; unit: string }>;
  inventory: Record<string, string>;
  contributions: Array<{ id: string; aggregationId: string; listingId: string; sellerId: string; quantity: string; unit: string; status: string }>;
  seq: number;
  tail: Promise<void>;
}

function makeState(): State {
  return {
    req: { id: "req_1", buyerId: BUYER, quantity: "100", unit: "kg", status: "OPEN" },
    agg: { id: "agg_1", requirementId: "req_1", committedQuantity: "0", status: "OPEN" },
    listings: {
      lst_a: { id: "lst_a", sellerId: SELLER, status: "ACTIVE", availableQuantity: "80", unit: "kg" },
      lst_b: { id: "lst_b", sellerId: SELLER2, status: "ACTIVE", availableQuantity: "60", unit: "kg" },
    },
    // Separate inventory table (mirrors the real Inventory model): commit
    // decrements inventory + listing mirror together; cancel restores inventory
    // + listing mirror together. Kept in sync with listing.availableQuantity
    // unless a test deliberately drifts one side.
    inventory: { lst_a: "80", lst_b: "60" },
    contributions: [],
    seq: 0,
    tail: Promise.resolve(),
  };
}

function toRecord(c: State["contributions"][number]) {
  return {
    ...c,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    seller: { displayName: "Seller" },
    listing: { title: "Maize lot" },
  };
}

import { ContributionValidation } from "../src/modules/validation/contribution";


// In-memory double matching the exact queries in ContributionService.
// Guarded updateMany guards (count 0/1), GREATEST raw-SQL replay.
function fakePrisma(state: State) {
  const D = (v: unknown) => new Decimal(String(v));
  const tx = {
    requirement: {
      findUnique: async () => ({ ...state.req, aggregation: { ...state.agg } }),
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(state.req, args.data);
        return { ...state.req };
      },
    },
    aggregation: {
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(state.agg, args.data);
        return { ...state.agg };
      },
      updateMany: async (args: { where: { id: string; committedQuantity?: { lte?: unknown } }; data: { committedQuantity?: { increment?: unknown } } }) => {
        if (args.where.id !== state.agg.id) return { count: 0 };
        const ceiling = D(args.where.committedQuantity?.lte ?? "0");
        if (D(state.agg.committedQuantity).gt(ceiling)) return { count: 0 };
        const inc = D(args.data.committedQuantity?.increment ?? "0");
        state.agg.committedQuantity = D(state.agg.committedQuantity).plus(inc).toString();
        return { count: 1 };
      },
    },
    listing: {
      findUnique: async (args: { where: { id: string } }) => {
        const l = state.listings[args.where.id];
        if (!l) return null;
        return { ...l, inventory: { availableQuantity: l.availableQuantity } };
      },
      updateMany: async (args: { where: { id?: string }; data: Record<string, { decrement?: unknown; increment?: unknown }> }) => {
        const l = args.where.id ? state.listings[args.where.id] : undefined;
        if (!l) return { count: 0 };
        const dec = args.data.availableQuantity?.decrement;
        const inc = args.data.availableQuantity?.increment;
        if (dec !== undefined) l.availableQuantity = D(l.availableQuantity).minus(D(dec)).toString();
        if (inc !== undefined) l.availableQuantity = D(l.availableQuantity).plus(D(inc)).toString();
        return { count: 1 };
      },
    },
    inventory: {
      // Guarded reservation decrement ONLY (commit path). Restore is via the
      // listing mirror + $executeRawUnsafe demand release (cancel path).
      updateMany: async (args: { where: { listingId: string; availableQuantity?: { gte?: unknown } }; data: { availableQuantity: { decrement?: unknown; increment?: unknown } } }) => {
        const current = state.inventory[args.where.listingId];
        if (current === undefined) return { count: 0 };
        const floor = D(args.where.availableQuantity?.gte ?? "0");
        if (D(current).lt(floor)) return { count: 0 };
        const dec = args.data.availableQuantity.decrement;
        const inc = args.data.availableQuantity.increment;
        // The real service decrements inventory on commit and INCREMENTS it on
        // cancel (separate calls). Model both against the inventory table.
        if (dec !== undefined) state.inventory[args.where.listingId] = D(current).minus(D(dec)).toString();
        else if (inc !== undefined) state.inventory[args.where.listingId] = D(current).plus(D(inc)).toString();
        return { count: 1 };
      },
    },
    contribution: {
      findFirst: async (args: { where: { aggregationId: string; listingId?: string; status?: { in: string[] } } }) => {
        const hit = state.contributions.find(
          (c) =>
            c.aggregationId === args.where.aggregationId &&
            (args.where.listingId === undefined || c.listingId === args.where.listingId) &&
            (args.where.status === undefined || args.where.status.in.includes(c.status))
        );
        return hit ? { id: hit.id } : null;
      },
      findUnique: async (args: { where: { id: string } }) => {
        const c = state.contributions.find((x) => x.id === args.where.id);
        if (!c) return null;
        return { ...toRecord(c), aggregation: { ...state.agg, requirement: { ...state.req } } };
      },
      findMany: async (args: { where: { aggregationId: string; status?: { in: string[] } } }) =>
        state.contributions
          .filter((c) => c.aggregationId === args.where.aggregationId && (args.where.status === undefined || args.where.status.in.includes(c.status)))
          .map((c) => ({ quantity: c.quantity, status: c.status })),
      create: async (args: { data: { aggregationId: string; listingId: string; sellerId: string; quantity: string; unit: string; status: string } }) => {
        state.seq += 1;
        const c = { id: `c_${state.seq}`, ...args.data };
        state.contributions.push(c);
        return toRecord(c);
      },
      updateMany: async (args: { where: { id: string; status: string }; data: { status: string } }) => {
        const c = state.contributions.find((x) => x.id === args.where.id);
        if (!c || c.status !== args.where.status) return { count: 0 };
        c.status = args.data.status;
        return { count: 1 };
      },
    },
    auditLog: { create: async () => ({}) },
    $executeRawUnsafe: async (query: unknown, ...sqlArgs: unknown[]) => {
      // Service call shape:
      //   $executeRawUnsafe(`UPDATE "aggregations" SET ... $1 ... $2`, qty, aggId)
      // so the quantity is the FIRST variadic arg (not the query string).
      const qty = D(sqlArgs[0]);
      const next = D(state.agg.committedQuantity).minus(qty);
      state.agg.committedQuantity = (next.isNegative() ? new Decimal(0) : next).toString();
      return 1;
    },
  };
  return { ...tx };
}

// Serializing $transaction with snapshot rollback (same pattern as
// tests/offers-accept.test.ts): overlapping transactions run one at a time
// so guarded updates serialize like real DB transactions.
function txPrisma(state: State) {
  const base = fakePrisma(state) as unknown as Record<string, unknown>;
  return {
    ...base,
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => {
      const previous = state.tail;
      let release!: () => void;
      state.tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      const snapshot = structuredClone({ req: state.req, agg: state.agg, listings: state.listings, inventory: state.inventory, contributions: state.contributions, seq: state.seq });
      try {
        return await fn(base);
      } catch (err) {
        state.req = snapshot.req; state.agg = snapshot.agg;
        state.listings = snapshot.listings; state.contributions = snapshot.contributions; state.seq = snapshot.seq;
        state.inventory = snapshot.inventory;
        throw err;
      } finally {
        release();
      }
    },
  };
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

describe("ContributionService.propose", () => {
  it("creates a non-binding PROPOSED contribution (inventory + demand untouched)", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const out = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    expect(out.status).toBe("PROPOSED");
    expect(out.quantity).toBe("30");
    expect(out.unit).toBe("kg");
    expect(state.listings.lst_a.availableQuantity).toBe("80");
    expect(state.agg.committedQuantity).toBe("0");
  });

  it("403s when the listing belongs to someone else (cross-user restriction)", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const err = await rejected(svc.propose("req_1", OTHER, "lst_a", new Decimal("10")));
    expect(err.statusCode).toBe(403);
  });

  it("400s on unit mismatch (no conversion)", async () => {
    const state = makeState();
    state.listings.lst_a.unit = "bags";
    const svc = new ContributionService(txPrisma(state) as never);
    const err = await rejected(svc.propose("req_1", SELLER, "lst_a", new Decimal("10")));
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/nit mismatch/i);
  });

  it("409s when the proposal exceeds available inventory", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const err = await rejected(svc.propose("req_1", SELLER, "lst_a", new Decimal("81")));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/inventory/i);
  });

  it("409s on a duplicate active contribution from the same listing", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    await svc.propose("req_1", SELLER, "lst_a", new Decimal("10"));
    const err = await rejected(svc.propose("req_1", SELLER, "lst_a", new Decimal("5")));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/already has an active contribution/i);
  });
});

describe("ContributionService.commit (binding step)", () => {
  it("reserves inventory + demand, flips requirement OPEN -> PARTIALLY_FULFILLED", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const proposed = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    const out = await svc.commit(proposed.id, BUYER);
    expect(out.status).toBe("COMMITTED");
    expect(state.listings.lst_a.availableQuantity).toBe("50");
    expect(state.agg.committedQuantity).toBe("30");
    expect(state.req.status).toBe("PARTIALLY_FULFILLED");
  });

  it("supports multiple contributions toward one requirement", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    const c2 = await svc.propose("req_1", SELLER2, "lst_b", new Decimal("40"));
    await svc.commit(c1.id, BUYER);
    await svc.commit(c2.id, BUYER);
    expect(state.agg.committedQuantity).toBe("70");
    expect(state.req.status).toBe("PARTIALLY_FULFILLED");
  });

  it("409s + rolls back when the commitment would exceed remaining demand", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("60"));
    await svc.commit(c1.id, BUYER);
    // Second proposal fits the pre-commit remaining demand (40 left, propose 40),
    // but demand is consumed before commit so the guarded commit must 409 + roll back.
    const c2 = await svc.propose("req_1", SELLER2, "lst_b", new Decimal("40"));
    state.agg.committedQuantity = "70"; // concurrent buyer consumed demand first
    const err = await rejected(svc.commit(c2.id, BUYER));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/demand/i);
    // Rollback: second contribution still PROPOSED, inventory + demand unchanged.
    expect(state.contributions.find((c) => c.id === c2.id)?.status).toBe("PROPOSED");
    expect(state.listings.lst_b.availableQuantity).toBe("60");
    expect(state.agg.committedQuantity).toBe("70");
  });

  it("409s + rolls back when listing inventory is drained before commit", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("70"));
    state.listings.lst_a.availableQuantity = "10"; // drained by a concurrent sale
    state.inventory.lst_a = "10";
    const err = await rejected(svc.commit(c1.id, BUYER));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/inventory/i);
    expect(state.contributions.find((c) => c.id === c1.id)?.status).toBe("PROPOSED");
    expect(state.agg.committedQuantity).toBe("0");
  });

  it("serializes concurrent commits: exactly one wins, no over-commit", async () => {
    const state = makeState();
    state.req.quantity = "100";
    state.listings.lst_a.availableQuantity = "100";
    state.listings.lst_b.availableQuantity = "100";
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("70"));
    const c2 = await svc.propose("req_1", SELLER2, "lst_b", new Decimal("70"));
    const results = await Promise.allSettled([svc.commit(c1.id, BUYER), svc.commit(c2.id, BUYER)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(state.agg.committedQuantity).toBe("70");
  });

  it("403s when a non-owner tries to commit (cross-user restriction)", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("10"));
    const err = await rejected(svc.commit(c1.id, OTHER));
    expect(err.statusCode).toBe(403);
  });

  it("idempotent-safe: retrying a successful commit returns 409 (no double reserve)", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("10"));
    await svc.commit(c1.id, BUYER);
    const err = await rejected(svc.commit(c1.id, BUYER));
    expect(err.statusCode).toBe(409);
    expect(state.listings.lst_a.availableQuantity).toBe("70");
    expect(state.agg.committedQuantity).toBe("10");
  });
});

describe("ContributionService.fulfil", () => {
  it("fulfils a COMMITTED contribution without changing inventory; full delivery flips requirement FULFILLED", async () => {
    const state = makeState();
    state.req.quantity = "50";
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("50"));
    await svc.commit(c1.id, BUYER);
    const out = await svc.fulfil(c1.id, BUYER);
    expect(out.status).toBe("FULFILLED");
    expect(state.listings.lst_a.availableQuantity).toBe("30"); // reserved at commit, unchanged
    expect(state.req.status).toBe("FULFILLED");
    expect(state.agg.status).toBe("CLOSED");
  });

  it("a requirement is NOT fulfilled merely because it has proposals or partial commits", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    expect(state.req.status).toBe("OPEN"); // proposals do not change status
    await svc.commit(c1.id, BUYER);
    expect(state.req.status).toBe("PARTIALLY_FULFILLED");
  });

  it("409s on duplicate fulfilment", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    await svc.commit(c1.id, BUYER);
    await svc.fulfil(c1.id, BUYER);
    const err = await rejected(svc.fulfil(c1.id, BUYER));
    expect(err.statusCode).toBe(409);
  });

  it("403s when a non-owner tries to fulfil", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    await svc.commit(c1.id, BUYER);
    const err = await rejected(svc.fulfil(c1.id, OTHER));
    expect(err.statusCode).toBe(403);
  });
});

describe("ContributionService.cancel", () => {
  it("seller cancels a PROPOSED contribution: no inventory or demand effect", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    const out = await svc.cancel(c1.id, SELLER);
    expect(out.status).toBe("CANCELLED");
    expect(state.listings.lst_a.availableQuantity).toBe("80");
    expect(state.agg.committedQuantity).toBe("0");
  });

  it("403s when the wrong seller tries to cancel a proposal", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    const err = await rejected(svc.cancel(c1.id, SELLER2));
    expect(err.statusCode).toBe(403);
  });

  it("buyer cancels a COMMITTED contribution: inventory restored, demand released, requirement re-opens", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    await svc.commit(c1.id, BUYER);
    const out = await svc.cancel(c1.id, BUYER);
    expect(out.status).toBe("CANCELLED");
    expect(state.listings.lst_a.availableQuantity).toBe("80");
    expect(state.agg.committedQuantity).toBe("0");
    expect(state.req.status).toBe("OPEN");
  });

  it("cancellation never drives committed supply negative", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("30"));
    await svc.commit(c1.id, BUYER);
    state.agg.committedQuantity = "5"; // simulate drift below the contribution qty
    await svc.cancel(c1.id, BUYER);
    expect(state.agg.committedQuantity).toBe("0");
  });

  it("a FULFILLED contribution can never be cancelled", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    await svc.commit(c1.id, BUYER);
    await svc.fulfil(c1.id, BUYER);
    const err = await rejected(svc.cancel(c1.id, BUYER));
    expect(err.statusCode).toBe(400);
  });

  it("cancelling an already-CANCELLED contribution returns 409", async () => {
    const state = makeState();
    const svc = new ContributionService(txPrisma(state) as never);
    const c1 = await svc.propose("req_1", SELLER, "lst_a", new Decimal("20"));
    await svc.cancel(c1.id, SELLER);
    const err = await rejected(svc.cancel(c1.id, SELLER));
    expect(err.statusCode).toBe(409);
  });
});

describe("ContributionValidation", () => {
  it("rejects invalid propose payloads", () => {
    expect(() => ContributionValidation.propose({ listingId: "", quantity: "10" })).toThrow();
    expect(() => ContributionValidation.propose({ listingId: "lst_a", quantity: "0" })).toThrow();
    expect(() => ContributionValidation.propose({ listingId: "lst_a", quantity: "-3" })).toThrow();
    expect(() => ContributionValidation.propose({ listingId: "lst_a", quantity: "abc" })).toThrow();
  });

  it("accepts a valid propose payload", () => {
    const parsed = ContributionValidation.propose({ listingId: "lst_a", quantity: "10.5" });
    expect(parsed.listingId).toBe("lst_a");
    expect(parsed.quantity.toString()).toBe("10.5");
  });
});

