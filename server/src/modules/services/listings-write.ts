// Listing write service: create + update.
//
// These methods own persistence and audit logging for listing mutations.

import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { ListingValidation } from "../validation/listing";
import { auditLog } from "../auditLog";
import { toListingRecord, type ListingStatus } from "../types/listing";
import { badRequestError, conflictError, forbiddenError, notFoundError } from "../../middleware/error-handler";

// Documented status lifecycle (see docs/api-contract.md and types/listing.ts):
//   DRAFT   -> ACTIVE | REJECTED
//   ACTIVE  -> DRAFT | REJECTED | SOLD
//   REJECTED-> DRAFT            (draft is reusable)
//   SOLD    -> (terminal; no status changes)
// Setting a listing's current status is an allowed no-op (idempotent publish).
const ALLOWED_STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["ACTIVE", "REJECTED"],
  ACTIVE: ["DRAFT", "REJECTED", "SOLD"],
  REJECTED: ["DRAFT"],
  SOLD: [],
};

export class ListingWriteService {
  static async create(
    input: import("../types/listing").CreateListingInput,
    prismaClient: PrismaClient
  ): Promise<import("../types/listing").ListingRecord> {
    // Create listing + inventory row atomically so every listing always has
    // exactly one inventory record. Inventory is the guarded source of truth
    // for availability; Listing.availableQuantity mirrors it for fast reads.
    const listing = await prismaClient.$transaction(async (tx) => {
      const created = await tx.listing.create({
        data: {
          sellerId: input.sellerId,
          title: input.title,
          description: input.description ?? null,
          category: input.category ?? null,
          commodity: input.commodity ?? null,
          quantity: input.quantity.toString(),
          unit: input.unit ?? null,
          pricePerUnit: input.pricePerUnit.toString(),
          currency: input.currency ?? "USD",
          location: input.location ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          availableQuantity: input.availableQuantity.toString(),
          status: "DRAFT",
        },
      });

      await tx.inventory.create({
        data: {
          listingId: created.id,
          availableQuantity: input.availableQuantity.toString(),
        },
      });

      return created;
    });

    // Audit via the caller's client (never the global singleton here) so the
    // write path stays fully injectable and testable.
    await auditLog({
      actorId: listing.sellerId,
      actorType: "PROFILE",
      entityType: `listing:${listing.id}`,
      entityId: listing.id,
      action: "LISTING_CREATED",
      payload: {
        sellerId: listing.sellerId,
        quantity: listing.quantity,
        pricePerUnit: listing.pricePerUnit,
        currency: listing.currency,
      },
      prismaClient,
    });

    return toListingRecord(listing);
  }

  static async update(
    id: string,
    input: import("../types/listing").UpdateListingInput,
    ownerId: string,
    prismaClient: PrismaClient
  ): Promise<import("../types/listing").ListingRecord> {
    const existing = await prismaClient.listing.findUnique({
      where: { id },
      select: { sellerId: true, status: true },
    });

    if (!existing) {
      notFoundError(`Listing not found: ${id}`);
    }
    if (existing.sellerId !== ownerId) {
      forbiddenError("Only the listing owner can update this listing");
    }

    // Enforce the documented status lifecycle server-side. The contract
    // promises SOLD is terminal ("resurrection" is rejected) — never trust a
    // client-supplied status claim.
    if (input.status !== undefined && input.status !== existing.status) {
      const from = existing.status as ListingStatus;
      const to = input.status;
      if (!ALLOWED_STATUS_TRANSITIONS[from]?.includes(to)) {
        badRequestError(`Invalid status transition ${from} -> ${to}`);
      }
    }

    const listing = await prismaClient.$transaction(async (tx) => {
      const current = await tx.listing.findUnique({
        where: { id },
        select: {
          quantity: true,
          inventory: { select: { availableQuantity: true } },
        },
      });
      if (!current) notFoundError(`Listing not found: ${id}`);
      if (!current.inventory) conflictError("Listing inventory is inconsistent and cannot be updated.");

      const currentAvailable = new Decimal(String(current.inventory.availableQuantity));
      const currentQuantity = new Decimal(String(current.quantity));
      const committedQuantity = currentQuantity.minus(currentAvailable);
      const nextQuantity = input.quantity ?? currentQuantity;
      const nextAvailable = input.availableQuantity ?? currentAvailable;
      if (nextAvailable.gt(nextQuantity)) {
        badRequestError("availableQuantity cannot exceed quantity");
      }
      if (nextQuantity.lt(committedQuantity.plus(nextAvailable))) {
        badRequestError("quantity cannot be less than already committed plus available quantity");
      }

      if (input.availableQuantity !== undefined) {
        const inventoryUpdate = await tx.inventory.updateMany({
          where: { listingId: id, availableQuantity: currentAvailable.toString() },
          data: { availableQuantity: input.availableQuantity.toString() },
        });
        if (inventoryUpdate.count !== 1) {
          conflictError("Inventory changed while updating this listing. Refresh and try again.");
        }
      }

      const updated = await tx.listing.update({
        where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description ?? null }),
        ...(input.category !== undefined && input.category !== null && {
          category: input.category ?? null,
        }),
        ...(input.commodity !== undefined && input.commodity !== null && {
          commodity: input.commodity ?? null,
        }),
        ...(input.quantity !== undefined && { quantity: input.quantity.toString() }),
        ...(input.unit !== undefined && input.unit !== null && { unit: input.unit ?? null }),
        ...(input.pricePerUnit !== undefined && {
          pricePerUnit: input.pricePerUnit.toString(),
        }),
        ...(input.currency !== undefined && { currency: input.currency ?? null }),
        ...(input.location !== undefined && input.location !== null && {
          location: input.location ?? null,
        }),
        ...(input.latitude !== undefined && { latitude: input.latitude ?? null }),
        ...(input.longitude !== undefined && { longitude: input.longitude ?? null }),
        ...(input.availableQuantity !== undefined && {
          availableQuantity: input.availableQuantity.toString(),
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
      return updated;
    });

    // Record the real state change (owner identity comes from the verified
    // caller, never the body).
    await auditLog({
      actorId: ownerId,
      actorType: "PROFILE",
      entityType: `listing:${id}`,
      entityId: id,
      action: "LISTING_UPDATED",
      payload: { status: listing.status, fields: Object.keys(input) },
      prismaClient,
    });

    return toListingRecord(listing);
  }
}
