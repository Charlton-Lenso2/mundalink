// Listing write service: create + update.
//
// These methods own persistence and audit logging for listing mutations.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { ListingValidation } from "../validation/listing";
import { auditListingCreated } from "../auditLog";
import { toListingRecord } from "../types/listing";
import { forbiddenError, notFoundError } from "../../middleware/error-handler";

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

    await auditListingCreated(listing.id, listing.sellerId, {
      quantity: listing.quantity,
      pricePerUnit: listing.pricePerUnit,
      currency: listing.currency,
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
      select: { sellerId: true },
    });

    if (!existing) {
      notFoundError(`Listing not found: ${id}`);
    }
    if (existing.sellerId !== ownerId) {
      forbiddenError("Only the listing owner can update this listing");
    }

    const listing = await prismaClient.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id },
      data: {
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

    return toListingRecord(listing);
  }
}
