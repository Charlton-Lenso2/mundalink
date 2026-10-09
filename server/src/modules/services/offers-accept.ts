// Offer acceptance service: the transactional, concurrency-safe acceptance.
//
// Acceptance runs inside a Prisma $transaction:
//   1. Re-read the offer + listing + inventory snapshot.
//   2. Validate listing ACTIVE, offer PENDING, correct ownership.
//   3. Guarded inventory decrement (`WHERE available >= qty`), check affected
//      rows; reject insufficient inventory.
//   4. Create exactly one AgreedDeal via upsert on offerId (idempotent vs retries).
//   5. Update offer to ACCEPTED.
//   6. Audit.
//
// The `WHERE available >= qty` guard plus a single connection per request make
// this safe under concurrent accepters.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { conflictError, badRequestError } from "../../middleware/error-handler";
import { ListingStatus } from "../types/listing";
import { OfferStatus, toOfferRecord } from "../types/offer";

export interface AcceptInput {
  offerId: string;
  buyerId: string;
  sellerId: string;
}

export interface TransitionInput {
  offerId: string;
  listingId: string;
  status: OfferStatus;
  buyerId?: string;
  sellerId?: string;
}

export interface OfferRecord {
  id: string;
  buyerId: string;
  listingId: string;
  offeredQuantity: string;
  offeredPrice: string;
  message: string | null;
  status: OfferStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export class OfferAcceptanceService {
  constructor(private readonly prisma: PrismaClient) {}

  async accept(input: AcceptInput): Promise<OfferRecord> {
    const { offerId, buyerId, sellerId } = input;

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: {
          id: true,
          buyerId: true,
          listingId: true,
          offeredQuantity: true,
          offeredPrice: true,
          status: true,
          expiresAt: true,
          listing: {
            select: {
              id: true,
              sellerId: true,
              status: true,
              availableQuantity: true,
            },
          },
        },
      });

      if (!offer) throw new Error(`Offer not found: ${offerId}`);
      if (offer.status !== OfferStatus.PENDING) {
        throw badRequestError(`Cannot accept an offer in status ${offer.status}`);
      }
      if (offer.listing.status !== ListingStatus.ACTIVE) {
        throw badRequestError(`Listing is not active`);
      }
      if (offer.listing.sellerId !== sellerId) {
        throw new Error("Only the listing owner can accept");
      }
      if (offer.buyerId !== buyerId) {
        throw new Error("Only the offer buyer can accept");
      }

      // Guarded inventory decrement. Check affected rows.
      const available = new Decimal(offer.listing.availableQuantity as string);
      const requested = new Decimal(offer.offeredQuantity as string);
      if (available.lt(requested)) {
        throw conflictError("Insufficient inventory for this offer");
      }

      const updated = await tx.inventory.updateMany({
        where: {
          listingId: offer.listingId,
          availableQuantity: { gte: requested },
        },
        data: {
          availableQuantity: available.minus(requested).toString(),
        },
      });

      if (updated.count !== 1) {
        throw conflictError("Insufficient inventory for this offer");
      }

      // Idempotent deal creation: unique constraint on offerId guarantees exactly
      // one AgreedDeal is ever created, even if the request retries.
      await tx.agreedDeal.upsert({
        where: { offerId: offerId },
        update: {},
        create: {
          offerId: offerId,
          listingId: offer.listingId,
          agreedQuantity: offer.offeredQuantity,
          agreedPrice: offer.offeredPrice,
          buyerId: offer.buyerId,
          sellerId: offer.listing.sellerId,
          status: "PENDING",
        },
      });

      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.ACCEPTED },
      });

      return toOfferRecord(updated);
    });
  }

  async withdraw(offerId: string, buyerId: string): Promise<OfferRecord> {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: { id: true, buyerId: true, status: true },
      });

      if (!offer) throw new Error(`Offer not found: ${offerId}`);
      if (offer.buyerId !== buyerId) {
        throw new Error("Only the offer buyer can withdraw");
      }
      if (offer.status !== OfferStatus.PENDING) {
        throw badRequestError(`Cannot withdraw an offer in status ${offer.status}`);
      }

      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.WITHDRAWN },
      });

      return toOfferRecord(updated);
    });
  }

  async expire(offerId: string, buyerId: string, expiresAt: Date): Promise<OfferRecord> {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: { id: true, buyerId: true, status: true },
      });

      if (!offer) throw new Error(`Offer not found: ${offerId}`);
      if (offer.buyerId !== buyerId) {
        throw new Error("Only the offer buyer can expire");
      }
      if (offer.status !== OfferStatus.PENDING) {
        throw badRequestError(`Cannot expire an offer in status ${offer.status}`);
      }

      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: OfferStatus.EXPIRED, expiresAt },
      });

      return toOfferRecord(updated);
    });
  }
}
