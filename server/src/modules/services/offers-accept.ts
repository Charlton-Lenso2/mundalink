// Offer acceptance service: the transactional, concurrency-safe acceptance.
// (Full doc comment in docs/api-contract.md — see "Inventory behavior".)

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { conflictError, badRequestError, forbiddenError, notFoundError } from "../../middleware/error-handler";
import { LISTING_STATUS } from "../types/listing";
import { OFFER_STATUS, OfferStatus, toOfferRecord } from "../types/offer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

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

    return this.prisma.$transaction(async (tx: TxClient) => {
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

      if (!offer) notFoundError(`Offer not found: ${offerId}`);
      if (offer.status !== OFFER_STATUS.PENDING) {
        badRequestError(`Cannot accept an offer in status ${offer.status}`);
      }
      if (offer.listing.status !== LISTING_STATUS.ACTIVE) {
        badRequestError(`Listing is not active`);
      }
      if (offer.listing.sellerId !== sellerId) {
        forbiddenError("Only the listing owner can accept");
      }
      if (offer.buyerId !== buyerId) {
        forbiddenError("Offer buyer mismatch");
      }

      // Guarded inventory decrement. Check affected rows.
      const available = new Decimal(String(offer.listing.availableQuantity));
      const requested = new Decimal(String(offer.offeredQuantity));
      if (available.lt(requested)) {
        conflictError("Insufficient inventory for this offer");
      }

      const decremented = await tx.inventory.updateMany({
        where: {
          listingId: offer.listingId,
          availableQuantity: { gte: requested.toString() },
        },
        data: {
          availableQuantity: available.minus(requested).toString(),
        },
      });

      if (decremented.count !== 1) {
        conflictError("Insufficient inventory for this offer");
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

      const accepted = await tx.offer.update({
        where: { id: offerId },
        data: { status: OFFER_STATUS.ACCEPTED },
      });

      return toOfferRecord(accepted);
    });
  }

  async withdraw(offerId: string, buyerId: string): Promise<OfferRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: { id: true, buyerId: true, status: true },
      });

      if (!offer) notFoundError(`Offer not found: ${offerId}`);
      if (offer.buyerId !== buyerId) {
        forbiddenError("Only the offer buyer can withdraw");
      }
      if (offer.status !== OFFER_STATUS.PENDING) {
        badRequestError(`Cannot withdraw an offer in status ${offer.status}`);
      }

      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: OFFER_STATUS.WITHDRAWN },
      });

      return toOfferRecord(updated);
    });
  }

  async expire(offerId: string, buyerId: string, expiresAt: Date): Promise<OfferRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const offer = await tx.offer.findUnique({
        where: { id: offerId },
        select: { id: true, buyerId: true, status: true },
      });

      if (!offer) notFoundError(`Offer not found: ${offerId}`);
      if (offer.buyerId !== buyerId) {
        forbiddenError("Only the offer buyer can expire");
      }
      if (offer.status !== OFFER_STATUS.PENDING) {
        badRequestError(`Cannot expire an offer in status ${offer.status}`);
      }

      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: OFFER_STATUS.EXPIRED, expiresAt },
      });

      return toOfferRecord(updated);
    });
  }
}
