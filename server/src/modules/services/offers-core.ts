// Offer service: query + create.
//
// Acceptance and transitions live in offers-accept.ts.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { ListingStatus } from "../types/listing";
import { OfferStatus, toOfferRecord } from "../types/offer";

export interface CreateOfferInput {
  buyerId: string;
  listingId: string;
  offeredQuantity: Decimal;
  offeredPrice: Decimal;
  message?: string;
}

export interface OfferService {
  findMyOffers(authenticatedUid: string): Promise<import("../types/offer").OfferRecord[]>;
  create(input: CreateOfferInput, prismaClient: PrismaClient): Promise<import("../types/offer").OfferRecord>;
}

export class PrismaOfferService {
  constructor(private readonly prisma: PrismaClient) {}

  async findMyOffers(authenticatedUid: string): Promise<import("../types/offer").OfferRecord[]> {
    return this.prisma.offer.findMany({
      where: {
        OR: [
          { buyerId: authenticatedUid },
          { listing: { sellerId: authenticatedUid } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: { listing: { select: { id: true, title: true, status: true } } },
    });
  }

  async create(input: CreateOfferInput): Promise<import("../types/offer").OfferRecord> {
    const { buyerId, listingId, offeredQuantity, offeredPrice, message } = input;

    // Buyer must not offer against their own listing.
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { sellerId: true, status: true, availableQuantity: true },
    });

    if (!listing) {
      throw new Error(`Listing not found: ${listingId}`);
    }
    if (listing.sellerId === buyerId) {
      throw new Error("A buyer cannot submit an offer against their own listing");
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new Error(`Cannot offer on a listing with status ${listing.status}`);
    }
    if (offeredQuantity.lte(new Decimal(0))) {
      throw new Error("offeredQuantity must be positive");
    }
    if (offeredPrice.lt(new Decimal(0))) {
      throw new Error("offeredPrice must be non-negative");
    }

    // Enforce "one open offer per buyer per listing".
    const existing = await this.prisma.offer.findUnique({
      where: { listingId_buyerId: { listingId, buyerId } },
      select: { status: true },
    });

    if (existing && existing.status !== OfferStatus.WITHDRAWN) {
      throw new Error("You already hold an open offer on this listing");
    }

    const offer = await this.prisma.offer.create({
      data: {
        buyerId,
        listingId,
        offeredQuantity: offeredQuantity.toString(),
        offeredPrice: offeredPrice.toString(),
        message: message ?? null,
        status: OfferStatus.PENDING,
      },
    });

    return toOfferRecord(offer);
  }
}
