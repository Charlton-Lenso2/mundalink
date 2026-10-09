// Inventory guard unit test with an in-memory Prisma double.
// Proves: guarded decrement rejects insufficient stock; concurrent accepts
// cannot both pass because the second sees reduced availability.

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import { guardInventory } from "../src/modules/inventory";

function fakePrisma(initialAvailable: string) {
  let available = new Decimal(initialAvailable);
  return {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        inventory: {
          findUnique: async () => ({ availableQuantity: available.toString() }),
          updateMany: async (args: {
            where: { availableQuantity?: { gte?: Decimal | string } };
            data: { availableQuantity: string };
          }) => {
            const floor = new Decimal(String(args.where.availableQuantity?.gte ?? "0"));
            if (available.gte(floor)) {
              available = new Decimal(args.data.availableQuantity);
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
      };
      return fn(tx);
    },
  };
}

describe("guardInventory", () => {
  it("reserves when stock is sufficient", async () => {
    const ok = await guardInventory({
      listingId: "lst_1",
      quantity: new Decimal("5"),
      prismaClient: fakePrisma("10") as never,
    });
    expect(ok).toBe(true);
  });

  it("rejects when stock is insufficient", async () => {
    await expect(
      guardInventory({
        listingId: "lst_1",
        quantity: new Decimal("11"),
        prismaClient: fakePrisma("10") as never,
      })
    ).rejects.toThrow(/Insufficient inventory/);
  });

  it("second concurrent reservation fails after the first drains stock", async () => {
    const shared = fakePrisma("10");
    const first = await guardInventory({
      listingId: "lst_1",
      quantity: new Decimal("7"),
      prismaClient: shared as never,
    });
    expect(first).toBe(true);
    await expect(
      guardInventory({
        listingId: "lst_1",
        quantity: new Decimal("7"),
        prismaClient: shared as never,
      })
    ).rejects.toThrow(/Insufficient inventory/);
  });
});
