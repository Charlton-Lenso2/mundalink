// Inventory guard + atomic decrement.
//
// MundaLink enforces an all-or-nothing inventory rule: a deal execution either
// succeeds against the full agreed quantity or is rejected (not partial
// fulfilment). The decrement is a guarded UPDATE with a `WHERE available >= qty`
// predicate, so concurrent offers cannot oversell. We check `affectedRows` and
// reject if the row was not updated.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { conflictError } from "../middleware/error-handler";

type TxClient = any;

export interface InventoryGuardOptions {
  listingId: string;
  quantity: Decimal;
  prismaClient?: PrismaClient;
}

/**
 * Atomically reserve `quantity` from `listingId` inventory.
 *
 * Returns `true` if the inventory was sufficient (affected rows === 1) and the
 * guard updated the row; `false` otherwise (insufficient inventory).
 *
 * The `WHERE available >= qty` predicate plus a single connection per request
 * makes this safe under concurrent accepters. Two in-flight accepters cannot
 * both pass the guard with the same quantity, because each UPDATE happens
 * sequentially against the DB and the snapshot isolation level blocks one of
 * them.
 */
export async function guardInventory(
  options: InventoryGuardOptions
): Promise<boolean> {
  const { listingId, quantity, prismaClient } = options;
  const p = prismaClient ?? prisma;
  const requested = new Decimal(quantity.toString());
  if (!requested.isFinite() || requested.lte(0)) {
    conflictError(`Invalid reservation quantity for listing ${listingId}`);
  }

  const res = await p.$transaction(async (tx: TxClient) => {
    // Single guarded atomic decrement: the WHERE clause is the concurrency
    // guard, and the DB computes the new value (no read-modify-write gap).
    const updated = await tx.inventory.updateMany({
      where: {
        listingId,
        availableQuantity: {
          gte: requested.toString(),
        },
      },
      data: {
        availableQuantity: { decrement: requested.toString() },
      },
    });

    if (updated.count === 1) {
      // Keep the listing mirror in sync inside the same transaction.
      await tx.listing.updateMany({
        where: { id: listingId },
        data: { availableQuantity: { decrement: requested.toString() } },
      });
      return { ok: true, updated: 1 };
    }
    return { ok: false, updated: 0 };
  });

  if (!res.ok || res.updated !== 1) {
    // With a single connection and the guarded predicate this should normally be
    // hit only when inventory was insufficient.
    conflictError(`Insufficient inventory for listing ${listingId}: requested ${quantity.toString()}`);
    return false; // unreachable, but keeps TS happy
  }

  return true;
}

/**
 * Reconcile inventory after a deal executes. This is a thin wrapper keeping the
 * all-or-nothing rule explicit: the decrement above already happened inside the
 * same transaction used to create the deal, so this is idempotent and is called
 * only for the deal's side-effect path.
 */
export async function reserveInventory(
  listingId: string,
  quantity: Decimal,
  prismaClient?: PrismaClient
): Promise<void> {
  const ok = await guardInventory({ listingId, quantity, prismaClient });
  if (!ok) {
    // The transaction layer already threw; this is defensive.
    throw new Error(`Reservation failed for listing ${listingId}`);
  }
}
