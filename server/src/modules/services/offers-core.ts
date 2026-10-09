// Offer service: query + create.
//
// Acceptance and transitions live in offers-accept.ts.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { LISTING_STATUS } from "../types/listing";
import { OFFER_STATUS, toOfferRecord } from "../types/offer";
import { badRequestError, forbiddenError, notFoundError } from "../../middleware/error-handler";

export interface CreateOfferInput {
  buyerId: string;
  listingId: string;
  offeredQuantity: Decimal;
  offeredPrice: Decimal;
  message?: string | null;
}

export interface OfferService {
  findMyOffers(authenticatedUid: string): Promise<import("../types/offer").OfferRecord[]>;
  create(input: CreateOfferInput, prismaClient: PrismaClient): Promise<import("../types/offer").OfferRecord>;
}

export class PrismaOfferService {
  constructor(private readonly prisma: PrismaClient) {}

  async findMyOffers(authenticatedUid: string): Promise<import("../types/offer").OfferRecord[]> {
    const rows = await this.prisma.offer.findMany({
      where: {
        OR: [
          { buyerId: authenticatedUid },
          { listing: { sellerId: authenticatedUid } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toOfferRecord);
  }

  async create(input: CreateOfferInput): Promise<import("../types/offer").OfferRecord> {
    const { buyerId, listingId, offeredQuantity, offeredPrice, message } = input;

    // Buyer must not offer against their own listing.
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true, status: true, availableQuantity: true },
    });

    if (!listing) {
      notFoundError(`Listing not found: ${listingId}`);
    }
    if (listing.sellerId === buyerId) {
      forbiddenError("A buyer cannot submit an offer against their own listing");
    }
    if (listing.status !== LISTING_STATUS.ACTIVE) {
      badRequestError(`Cannot offer on a listing with status ${listing.status}`);
    }
    if (offeredQuantity.lte(new Decimal(0))) {
      badRequestError("offeredQuantity must be positive");
    }
    if (offeredPrice.lt(new Decimal(0))) {
      badRequestError("offeredPrice must be non-negative");
    }

    // Enforce "one open offer per buyer per listing".
    const existing = await this.prisma.offer.findFirst({
      where: { listingId, buyerId, status: OFFER_STATUS.PENDING },
      select: { id: true },
    });

    if (existing) {
      badRequestError("You already hold an open offer on this listing");
    }

    const offer = await this.prisma.offer.create({
      data: {
        buyerId,
        listingId,
        offeredQuantity: offeredQuantity.toString(),
        offeredPrice: offeredPrice.toString(),
        message: message ?? null,
        status: OFFER_STATUS.PENDING,
      },
    });

    return toOfferRecord(offer);
  }
}
