// Listing write service tests (no DB required).
// Proves: status-transition enforcement (SOLD is terminal — no resurrection),
// ownership/404 gates, and atomic listing+inventory creation (all-or-nothing).

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { ListingWriteService } from "../src/modules/services/listings-write";

interface Row {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  category: string | null;
  commodity: string | null;
  quantity: string;
  unit: string | null;
  pricePerUnit: string;
  currency: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  availableQuantity: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeState {
  row: Row | null;
  inventories: Array<Record<string, unknown>>;
  failInventoryCreate: boolean;
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: "lst_1",
    sellerId: "seller_1",
    title: "Maize grain",
    description: null,
    category: "Grains",
    commodity: "Maize",
    quantity: "10",
    unit: "kg",
    pricePerUnit: "5",
    currency: "USD",
    location: "Harare",
    latitude: null,
    longitude: null,
    status: "DRAFT",
    availableQuantity: "10",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeState(row: Row | null = makeRow()): FakeState {
  return {
    row,
    inventories: row ? [{ listingId: row.id, availableQuantity: row.availableQuantity }] : [],
    failInventoryCreate: false,
  };
}

function fakePrisma(state: FakeState) {
  const client = {
    listing: {
      findUnique: async () =>
        state.row
          ? {
              ...state.row,
              inventory: state.inventories.find((inventory) => inventory.listingId === state.row?.id) ?? null,
            }
          : null,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const merged = state.row as Row;
        Object.assign(merged, args.data, { updatedAt: new Date() });
        return { ...merged };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const created = {
          id: "lst_new",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        } as unknown as Row;
        state.row = created;
        return { ...created };
      },
    },
    inventory: {
      create: async (args: { data: Record<string, unknown> }) => {
        if (state.failInventoryCreate) {
          throw new Error("inventory create failed");
        }
        const created = { id: "inv_new", createdAt: new Date(), updatedAt: new Date(), ...args.data };
        state.inventories.push(created);
        return { ...created };
      },
      updateMany: async (args: {
        where: { listingId: string; availableQuantity: string };
        data: { availableQuantity: string };
      }) => {
        const inventory = state.inventories.find((entry) => entry.listingId === args.where.listingId);
        if (!inventory || inventory.availableQuantity !== args.where.availableQuantity) {
          return { count: 0 };
        }
        inventory.availableQuantity = args.data.availableQuantity;
        return { count: 1 };
      },
    },
    auditLog: { create: async () => ({ id: "audit_1" }) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const beforeRow = state.row ? { ...state.row } : null;
      const beforeInv = [...state.inventories];
      try {
        return await fn(client);
      } catch (err) {
        // Model DB rollback.
        state.row = beforeRow;
        state.inventories = beforeInv;
        throw err;
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

describe("ListingWriteService.update status transitions", () => {
  it("allows DRAFT -> ACTIVE (publish)", async () => {
    const state = makeState(makeRow({ status: "DRAFT" }));
    const out = await ListingWriteService.update(
      "lst_1",
      { status: "ACTIVE" },
      "seller_1",
      fakePrisma(state) as never
    );
    expect(out.status).toBe("ACTIVE");
    expect(state.row?.status).toBe("ACTIVE");
  });

  it("treats same-status updates as an allowed no-op (idempotent publish)", async () => {
    const state = makeState(makeRow({ status: "ACTIVE" }));
    const out = await ListingWriteService.update(
      "lst_1",
      { status: "ACTIVE" },
      "seller_1",
      fakePrisma(state) as never
    );
    expect(out.status).toBe("ACTIVE");
  });

  it("allows ACTIVE -> SOLD (owner marks their own sold listing)", async () => {
    const state = makeState(makeRow({ status: "ACTIVE" }));
    const out = await ListingWriteService.update(
      "lst_1",
      { status: "SOLD" },
      "seller_1",
      fakePrisma(state) as never
    );
    expect(out.status).toBe("SOLD");
  });

  it("allows REJECTED -> DRAFT (draft is reusable)", async () => {
    const state = makeState(makeRow({ status: "REJECTED" }));
    const out = await ListingWriteService.update(
      "lst_1",
      { status: "DRAFT" },
      "seller_1",
      fakePrisma(state) as never
    );
    expect(out.status).toBe("DRAFT");
  });

  it("rejects DRAFT -> SOLD (must be published first) with 400", async () => {
    const state = makeState(makeRow({ status: "DRAFT" }));
    const err = await rejected(
      ListingWriteService.update("lst_1", { status: "SOLD" }, "seller_1", fakePrisma(state) as never)
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/Invalid status transition DRAFT -> SOLD/);
    expect(state.row?.status).toBe("DRAFT");
  });

  it("rejects resurrecting a SOLD listing (SOLD -> ACTIVE) with 400", async () => {
    const state = makeState(makeRow({ status: "SOLD" }));
    const err = await rejected(
      ListingWriteService.update("lst_1", { status: "ACTIVE" }, "seller_1", fakePrisma(state) as never)
    );
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/Invalid status transition SOLD -> ACTIVE/);
    expect(state.row?.status).toBe("SOLD");
  });

  it("rejects non-status edits that would also flip status illegally", async () => {
    // Any illegal transition is rejected regardless of other valid fields.
    const state = makeState(makeRow({ status: "SOLD" }));
    const err = await rejected(
      ListingWriteService.update(
        "lst_1",
        { title: "New title", status: "DRAFT" },
        "seller_1",
        fakePrisma(state) as never
      )
    );
    expect(err.statusCode).toBe(400);
    expect(state.row?.status).toBe("SOLD");
    expect(state.row?.title).toBe("Maize grain");
  });

  it("rejects a non-owner with 403", async () => {
    const state = makeState(makeRow({ status: "DRAFT" }));
    const err = await rejected(
      ListingWriteService.update("lst_1", { status: "ACTIVE" }, "intruder", fakePrisma(state) as never)
    );
    expect(err.statusCode).toBe(403);
    expect(state.row?.status).toBe("DRAFT");
  });

  it("404s for an unknown listing", async () => {
    const state = makeState(null);
    const err = await rejected(
      ListingWriteService.update("missing", { status: "ACTIVE" }, "seller_1", fakePrisma(state) as never)
    );
    expect(err.statusCode).toBe(404);
  });

  it("keeps inventory and the listing availability mirror in sync", async () => {
    const state = makeState(makeRow());
    const out = await ListingWriteService.update(
      "lst_1",
      { availableQuantity: new Decimal("7") },
      "seller_1",
      fakePrisma(state) as never
    );

    expect(out.availableQuantity).toBe("7");
    expect(state.row?.availableQuantity).toBe("7");
    expect(state.inventories[0].availableQuantity).toBe("7");
  });

  it("rejects availability greater than the listing quantity", async () => {
    const state = makeState(makeRow());
    const err = await rejected(
      ListingWriteService.update(
        "lst_1",
        { availableQuantity: new Decimal("11") },
        "seller_1",
        fakePrisma(state) as never
      )
    );

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/cannot exceed quantity/i);
    expect(state.inventories[0].availableQuantity).toBe("10");
  });

  it("does not allow total quantity to erase previously committed inventory", async () => {
    const row = makeRow({ quantity: "10", availableQuantity: "5" });
    const state = makeState(row);
    state.inventories[0].availableQuantity = "5";
    const err = await rejected(
      ListingWriteService.update(
        "lst_1",
        { quantity: new Decimal("7") },
        "seller_1",
        fakePrisma(state) as never
      )
    );

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/already committed/i);
    expect(state.row?.quantity).toBe("10");
  });
});

describe("ListingWriteService.create", () => {
  const input = {
    sellerId: "seller_1",
    title: "Maize grain",
    quantity: new Decimal("10"),
    pricePerUnit: new Decimal("5"),
    availableQuantity: new Decimal("10"),
    currency: "USD",
  };

  it("creates the listing and its inventory row in one transaction (DRAFT)", async () => {
    const state = makeState(null);
    const out = await ListingWriteService.create(input as never, fakePrisma(state) as never);
    expect(out.status).toBe("DRAFT");
    expect(out.quantity).toBe("10");
    expect(state.inventories).toHaveLength(1);
    expect(state.inventories[0]).toMatchObject({
      listingId: "lst_new",
      availableQuantity: "10",
    });
  });

  it("rolls back the listing when inventory creation fails (all-or-nothing)", async () => {
    const state = makeState(null);
    state.failInventoryCreate = true;
    const err = await rejected(
      ListingWriteService.create(input as never, fakePrisma(state) as never)
    );
    expect(err.message).toMatch(/inventory create failed/);
    expect(state.row).toBeNull();
    expect(state.inventories).toHaveLength(0);
  });
});
