// Requirement service + validation tests (in-memory Prisma double — no DB).
//
// Proves: BUYER-owned CRUD with server-side ownership; OPEN-only edits;
// cancel rules (blocked while committed/fulfilled exist; proposals voided);
// deterministic discovery filters + pagination; invalid units, quantities,
// prices, and dates rejected; cross-user access restrictions (owner vs
// discoverable statuses).
//
// NOTE: authentication and BUYER/SELLER/OBSERVER role gates are enforced in
// routes/requireRole (covered by HTTP-boundary tests). Services enforce
// ownership and state transitions.

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { RequirementService } from "../src/modules/services/requirements";
import { RequirementValidation } from "../src/modules/validation/requirement";

interface ReqRow {
  id: string;
  buyerId: string;
  title: string;
  description: string | null;
  qualityNotes: string | null;
  category: string | null;
  commodity: string | null;
  quantity: string;
  unit: string;
  location: string | null;
  neededBy: Date | null;
  targetPrice: string | null;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  buyer?: { displayName: string | null };
}

interface State {
  reqs: ReqRow[];
  contributions: Array<{ id: string; aggregationId: string; status: string; quantity: string }>;
  seq: number;
}

const BUYER = "buyer_1";
const OTHER = "buyer_2";

function makeState(): State {
  return { reqs: [], contributions: [], seq: 0 };
}

function row(over: Partial<ReqRow> & { id: string; buyerId: string }): ReqRow {
  return {
    title: "Need maize",
    description: null,
    qualityNotes: null,
    category: null,
    commodity: "Maize",
    quantity: "100",
    unit: "kg",
    location: "Lusaka",
    neededBy: null,
    targetPrice: null,
    currency: "USD",
    status: "OPEN",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    buyer: { displayName: "Buyer One" },
    ...over,
  };
}

function fakePrisma(state: State) {
  const client = {
    requirement: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.seq += 1;
        const r = row({
          id: `req_${state.seq}`,
          buyerId: String(args.data.buyerId),
          title: String(args.data.title),
          quantity: String(args.data.quantity),
          unit: String(args.data.unit),
          status: "OPEN",
        });
        for (const k of ["description", "qualityNotes", "category", "commodity", "location"] as const) {
          if (args.data[k] !== undefined) (r as unknown as Record<string, unknown>)[k] = args.data[k];
        }
        if (args.data.neededBy !== undefined) r.neededBy = args.data.neededBy as Date | null;
        if (args.data.targetPrice !== undefined) r.targetPrice = args.data.targetPrice as string | null;
        if (args.data.currency !== undefined) r.currency = String(args.data.currency);
        state.reqs.push(r);
        return { ...r };
      },
      findUnique: async (args: { where: { id: string } }) =>
        state.reqs.find((r) => r.id === args.where.id) ?? null,
      findMany: async (args: { where?: Record<string, unknown>; skip?: number; take?: number }) => {
        let rows = [...state.reqs];
        const w = args.where ?? {};
        if (typeof w.buyerId === "string") rows = rows.filter((r) => r.buyerId === w.buyerId);
        const statusIn = (w.status as { in?: string[] } | undefined)?.in;
        if (statusIn) rows = rows.filter((r) => statusIn.includes(r.status));
        if (typeof w.commodity === "string") rows = rows.filter((r) => r.commodity === w.commodity);
        if (typeof w.category === "string") rows = rows.filter((r) => r.category === w.category);
        if (typeof w.unit === "string") rows = rows.filter((r) => r.unit === w.unit);
        const loc = w.location as { contains?: string; mode?: string } | undefined;
        if (loc?.contains) {
          const needle = loc.contains.toLowerCase();
          rows = rows.filter((r) => (r.location ?? "").toLowerCase().includes(needle));
        }
        const nb = w.neededBy as { gte?: Date } | undefined;
        if (nb?.gte) rows = rows.filter((r) => r.neededBy !== null && r.neededBy >= nb.gte!);
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take).map((r) => ({
          ...r,
          aggregation: { committedQuantity: committedFor(r.id, state) },
        }));
      },
      count: async (args: { where?: Record<string, unknown> }) => {
        const rows = await client.requirement.findMany({ where: args.where });
        return rows.length;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const r = state.reqs.find((x) => x.id === args.where.id);
        if (!r) throw new Error("not found");
        Object.assign(r, args.data, { updatedAt: new Date() });
        return { ...r };
      },
    },
    aggregation: {
      create: async (args: { data: { requirementId: string; committedQuantity: string; status: string } }) => ({
        id: `agg_${args.data.requirementId}`,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async () => ({ id: "agg_1" }),
    },
    contribution: {
      updateMany: async (args: { where: { aggregationId: string; status: string } }) => {
        let count = 0;
        for (const c of state.contributions) {
          if (c.aggregationId === args.where.aggregationId && c.status === args.where.status) {
            c.status = "CANCELLED";
            count += 1;
          }
        }
        return { count };
      },
    },
    auditLog: { create: async () => ({}) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };
  return client;
}

function committedFor(reqId: string, state: State): string {
  const aggId = `agg_${reqId}`;
  let total = new Decimal(0);
  for (const c of state.contributions) {
    if (c.aggregationId === aggId && ["COMMITTED", "FULFILLED"].includes(c.status)) {
      total = total.plus(new Decimal(c.quantity));
    }
  }
  return total.toFixed();
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

function validCreate(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Need maize", quantity: "100", unit: "kg", commodity: "Maize", location: "Lusaka", ...over };
}



describe("RequirementService.create", () => {
  it("creates an OPEN requirement owned by the caller (buyerId is server-side, never from the body)", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const parsed = RequirementValidation.create(validCreate());
    const out = await svc.create({
      buyerId: BUYER,
      title: parsed.title,
      description: parsed.description ?? null,
      qualityNotes: parsed.qualityNotes ?? null,
      category: parsed.category ?? null,
      commodity: parsed.commodity ?? null,
      quantity: parsed.quantity,
      unit: parsed.unit,
      location: parsed.location ?? null,
      neededBy: parsed.neededBy ?? null,
      targetPrice: parsed.targetPrice ?? null,
      currency: parsed.currency ?? "USD",
    });
    expect(out.status).toBe("OPEN");
    expect(out.buyerId).toBe(BUYER);
    expect(out.quantity).toBe("100");
    expect(out.unit).toBe("kg");
    expect(state.reqs).toHaveLength(1);
  });

  it("persists optional target price + currency using the existing price conventions", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const parsed = RequirementValidation.create(validCreate({ targetPrice: "12.50", currency: "ZMW" }));
    expect(parsed.targetPrice?.toString()).toBe("12.5");
    expect(parsed.currency).toBe("ZMW");
    const out = await svc.create({
      buyerId: BUYER, title: parsed.title, description: null, qualityNotes: null,
      category: null, commodity: null, quantity: parsed.quantity, unit: parsed.unit,
      location: null, neededBy: null, targetPrice: parsed.targetPrice ?? null, currency: parsed.currency ?? "USD",
    });
    expect(out.targetPrice).toBe("12.5");
    expect(out.currency).toBe("ZMW");

describe("RequirementService.update (owner edits)", () => {
  async function owned(state: State, svc: RequirementService) {
    return svc.create({
      buyerId: BUYER, title: "Need maize", description: null, qualityNotes: null,
      category: null, commodity: null, quantity: new Decimal("100"), unit: "kg",
      location: null, neededBy: null, targetPrice: null, currency: "USD",
    });
  }

  it("allows the owner to edit while OPEN", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await owned(state, svc);
    const parsed = RequirementValidation.update({ title: "Need white maize", quantity: "120" });
    const out = await svc.update(created.id, parsed, BUYER);
    expect(out.title).toBe("Need white maize");
    expect(out.quantity).toBe("120");
  });

  it("403s when a different user tries to edit (cross-user restriction)", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await owned(state, svc);
    const err = await rejected(svc.update(created.id, { title: "Hijack" }, OTHER));
    expect(err.statusCode).toBe(403);
  });

  it("409s when the requirement is no longer OPEN", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await owned(state, svc);
    state.reqs[0].status = "PARTIALLY_FULFILLED";
    const err = await rejected(svc.update(created.id, { title: "Too late" }, BUYER));
    expect(err.statusCode).toBe(409);
  });
});

describe("RequirementService.cancel", () => {
  async function ownedOpen(state: State, svc: RequirementService) {
    return svc.create({
      buyerId: BUYER, title: "Need maize", description: null, qualityNotes: null,
      category: null, commodity: null, quantity: new Decimal("100"), unit: "kg",
      location: null, neededBy: null, targetPrice: null, currency: "USD",
    });
  }

  it("cancels an OPEN requirement and voids remaining PROPOSED contributions", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await ownedOpen(state, svc);
    state.contributions.push({ id: "c1", aggregationId: `agg_${created.id}`, status: "PROPOSED", quantity: "10" });
    const out = await svc.cancel(created.id, BUYER);
    expect(out.status).toBe("CANCELLED");
    expect(state.contributions[0].status).toBe("CANCELLED");
  });

  it("409s when committed supply exists (must cancel contributions first)", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await ownedOpen(state, svc);
    state.reqs[0].status = "PARTIALLY_FULFILLED";
    state.contributions.push({ id: "c1", aggregationId: `agg_${created.id}`, status: "COMMITTED", quantity: "40" });
    const err = await rejected(svc.cancel(created.id, BUYER));
    expect(err.statusCode).toBe(409);
    expect(err.message).toMatch(/committed contributions/i);
  });

  it("403s when a non-owner tries to cancel", async () => {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const created = await ownedOpen(state, svc);
    const err = await rejected(svc.cancel(created.id, OTHER));
    expect(err.statusCode).toBe(403);
  });
});

  });
});


describe("RequirementService discovery (findOpen / findMine / findById)", () => {
  async function seeded() {
    const state = makeState();
    const svc = new RequirementService(fakePrisma(state) as never);
    const mk = async (buyerId: string, over: Record<string, unknown>, status = "OPEN") => {
      const parsed = RequirementValidation.create(validCreate(over));
      const created = await svc.create({
        buyerId, title: parsed.title, description: null, qualityNotes: null,
        category: parsed.category ?? null, commodity: parsed.commodity ?? null,
        quantity: parsed.quantity, unit: parsed.unit, location: parsed.location ?? null,
        neededBy: parsed.neededBy ?? null, targetPrice: null, currency: "USD",
      });
      state.reqs[state.reqs.length - 1].status = status;
      return created;
    };
    await mk(BUYER, { commodity: "Maize", location: "Lusaka" });
    await mk(BUYER, { commodity: "Soya", location: "Ndola" });
    await mk(BUYER, { commodity: "Maize", location: "Lusaka" }, "FULFILLED");
    await mk(OTHER, { commodity: "Maize", location: "Livingstone" });
    return { state, svc };
  }

  it("findOpen returns only OPEN/PARTIALLY_FULFILLED with pagination meta", async () => {
    const { svc } = await seeded();
    const page = await svc.findOpen(undefined, 1, 2);
    expect(page.total).toBe(3);
    expect(page.totalPages).toBe(2);
    expect(page.items).toHaveLength(2);
    expect(page.items.every((r) => ["OPEN", "PARTIALLY_FULFILLED"].includes(r.status))).toBe(true);
  });

  it("findOpen filters deterministically by commodity and location", async () => {
    const { svc } = await seeded();
    const page = await svc.findOpen({ commodity: "Maize", location: "lusaka" }, 1, 20);
    expect(page.total).toBe(1);
    expect(page.items[0].buyerId).toBe(BUYER);
  });

  it("findMine returns the buyer's own requirements in any status", async () => {
    const { svc } = await seeded();
    const page = await svc.findMine(BUYER, 1, 20);
    expect(page.total).toBe(3);
    expect(page.items.every((r) => r.buyerId === BUYER)).toBe(true);
  });

  it("findById: owner sees any status; others only discoverable (else null -> 404)", async () => {
    const { svc } = await seeded();
    const mine = await svc.findMine(BUYER, 1, 20);
    const fulfilledRow = mine.items.find((r) => r.status === "FULFILLED")!;
    expect(await svc.findById(fulfilledRow.id, BUYER)).not.toBeNull();
    expect(await svc.findById(fulfilledRow.id, OTHER)).toBeNull();
  });

  it("discovery never exposes private buyer details", async () => {
    const { svc } = await seeded();
    const page = await svc.findOpen(undefined, 1, 20);
    for (const r of page.items) {
      const blob = JSON.stringify(r).toLowerCase();
      expect(blob).not.toContain("email");
      expect(blob).not.toContain("phone");
    }
  });
});

describe("RequirementValidation", () => {
  it("rejects invalid quantities (zero, negative, non-numeric)", () => {
    for (const quantity of ["0", "-5", "abc", ""]) {
      expect(() => RequirementValidation.create(validCreate({ quantity }))).toThrow();
    }
  });

  it("rejects an invalid target price and currency", () => {
    expect(() => RequirementValidation.create(validCreate({ targetPrice: "-1" }))).toThrow();
    expect(() => RequirementValidation.create(validCreate({ currency: "US" }))).toThrow();
    expect(() => RequirementValidation.create(validCreate({ currency: "usdollar" }))).toThrow();
  });

  it("rejects invalid dates and accepts a future fulfilment date", () => {
    expect(() => RequirementValidation.create(validCreate({ neededBy: "not-a-date" }))).toThrow();
    const parsed = RequirementValidation.create(validCreate({ neededBy: "2026-12-31T00:00:00.000Z" }));
    expect(parsed.neededBy).toBeInstanceOf(Date);
  });

  it("requires a valid title and unit", () => {
    expect(() => RequirementValidation.create(validCreate({ title: "AB" }))).toThrow();
    expect(() => RequirementValidation.create(validCreate({ unit: "" }))).toThrow();
  });
});
