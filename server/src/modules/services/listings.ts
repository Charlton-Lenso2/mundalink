// Listing service: find + read.
//
// The `create` and `update` methods are in listings-write.ts.

import type { PrismaClient } from "@prisma/client";
import { ListingRecord, toListingRecord } from "../types/listing";

export interface ListingFilters {
  category?: string;
  location?: string;
  status?: import("../types/listing").ListingStatus;
}

export interface ListingPage {
  items: ListingRecord[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListingService {
  findAll(
    sellerId?: string,
    filters?: ListingFilters,
    page?: number,
    limit?: number
  ): Promise<ListingPage>;
  findById(id: string, prismaClient: PrismaClient): Promise<ListingRecord | null>;
  create(input: import("../types/listing").CreateListingInput, prismaClient: PrismaClient): Promise<ListingRecord>;
  update(
    id: string,
    input: import("../types/listing").UpdateListingInput,
    ownerId: string,
    prismaClient: PrismaClient
  ): Promise<ListingRecord>;
}

export class PrismaListingService implements ListingService {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(
    _sellerId?: string,
    filters?: ListingFilters,
    page = 1,
    limit = 20
  ): Promise<ListingPage> {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};

    if (filters?.category) where.category = filters.category;
    if (filters?.status) where.status = filters.status;
    if (filters?.location) where.location = { contains: filters.location };

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      items: items.map(toListingRecord),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, prismaClient: PrismaClient): Promise<ListingRecord | null> {
    const listing = await prismaClient.listing.findUnique({
      where: { id },
    });
    return listing ? toListingRecord(listing) : null;
  }

  async create(
    input: import("../types/listing").CreateListingInput,
    prismaClient: PrismaClient
  ): Promise<ListingRecord> {
    const listing = await prismaClient.listing.create({
      data: {
        sellerId: input.sellerId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        commodity: input.commodity ?? null,
        quantity: input.quantity.toString(),
        unit: input.unit ?? null,
        pricePerUnit: input.pricePerUnit.toString(),
        currency: input.currency,
        location: input.location ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        availableQuantity: input.availableQuantity.toString(),
        status: "DRAFT",
      },
    });

    // Audit via the shared singleton.
    const { auditListingCreated } = await import("../modules/auditLog");
    await auditListingCreated(listing.id, listing.sellerId, {
      quantity: listing.quantity,
      pricePerUnit: listing.pricePerUnit,
      currency: listing.currency,
    });

    return toListingRecord(listing);
  }

  async update(
    id: string,
    input: import("../types/listing").UpdateListingInput,
    ownerId: string,
    prismaClient: PrismaClient
  ): Promise<ListingRecord> {
    const existing = await prismaClient.listing.findUnique({
      where: { id },
      select: { sellerId: true },
    });

    if (!existing) {
      throw new Error(`Listing not found: ${id}`);
    }
    if (existing.sellerId !== ownerId) {
      throw new Error("Forbidden");
    }

    const listing = await prismaClient.listing.update({
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

    return toListingRecord(listing);
  }
}
