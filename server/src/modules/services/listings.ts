// Listing service: find + read.
//
// The `create` and `update` methods are in listings-write.ts.

import type { PrismaClient } from "@prisma/client";
import { ListingRecord, toListingRecord } from "../types/listing";
import { ListingWriteService } from "./listings-write";

export interface ListingFilters {
  category?: string;
  location?: string;
  status?: import("../types/listing").ListingStatus;
  search?: string;
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
    if (filters?.location) where.location = { contains: filters.location, mode: "insensitive" };
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
        { commodity: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { seller: { select: { displayName: true } } },
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
      include: { seller: { select: { displayName: true } } },
    });
    return listing ? toListingRecord(listing) : null;
  }

  async create(
    input: import("../types/listing").CreateListingInput,
    prismaClient: PrismaClient
  ): Promise<ListingRecord> {
    // Single write path: listings-write owns persistence, the inventory row,
    // and audit logging (never create a listing without its inventory row).
    return ListingWriteService.create(input, prismaClient);
  }

  async update(
    id: string,
    input: import("../types/listing").UpdateListingInput,
    ownerId: string,
    prismaClient: PrismaClient
  ): Promise<ListingRecord> {
    // Single write path: ownership, status-transition rules, and audit logging
    // live in listings-write (proper 403/404/400 HTTP errors, not bare 500s).
    return ListingWriteService.update(id, input, ownerId, prismaClient);
  }
}
