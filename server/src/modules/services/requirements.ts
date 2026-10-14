// Requirement service: buyer demand CRUD + aggregation view.
//
// A Requirement is created OPEN together with exactly one Aggregation (mirrors
// Listing+Inventory). Ownership is server-side (buyerId from the verified
// token). Status changes are server-driven; the buyer may only cancel. Reads of
// non-owned requirements are limited to OPEN/PARTIALLY_FULFILLED (discovery) and
// never expose private buyer contact details.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { toRequirementRecord, OPEN_REQUIREMENT_STATUSES, type CreateRequirementInput, type UpdateRequirementInput, type RequirementRecord, type RequirementStatus } from "../types/requirement";
import { toContributionRecord, sumQuantities, COMMITTED_SUPPLY_STATUSES, type AggregationView } from "../types/contribution";
import { auditLog } from "../auditLog";
import { badRequestError, conflictError, forbiddenError, notFoundError } from "../../middleware/error-handler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export interface RequirementFilters {
  commodity?: string;
  category?: string;
  location?: string;
  unit?: string;
  neededByFrom?: Date;
}

export type EnrichedRequirement = RequirementRecord & {
  committedSupply: string;
  remainingDemand: string;
};

const OPEN_STATUSES = OPEN_REQUIREMENT_STATUSES;

export class RequirementService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Create a requirement (OPEN) + its aggregation atomically. */
  async create(input: CreateRequirementInput): Promise<RequirementRecord> {
    const requirement = await this.prisma.$transaction(async (tx: TxClient) => {
      const created = await tx.requirement.create({
        data: {
          buyerId: input.buyerId,
          title: input.title,
          description: input.description,
          qualityNotes: input.qualityNotes,
          category: input.category,
          commodity: input.commodity,
          quantity: input.quantity.toString(),
          unit: input.unit,
          location: input.location,
          neededBy: input.neededBy,
          targetPrice: input.targetPrice === null || input.targetPrice === undefined ? null : input.targetPrice.toString(),
          currency: input.currency,
          status: "OPEN",
        },
      });
      await tx.aggregation.create({
        data: { requirementId: created.id, committedQuantity: "0", status: "OPEN" },
      });
      return created;
    });

    await auditLog({
      actorId: input.buyerId,
      actorType: "PROFILE",
      entityType: "requirement",
      entityId: requirement.id,
      action: "REQUIREMENT_CREATED",
      payload: { quantity: requirement.quantity, unit: requirement.unit },
      prismaClient: this.prisma,
    });
    return toRequirementRecord(requirement);
  }

  private buildWhere(filters: RequirementFilters | undefined, statuses: RequirementStatus[]): Record<string, unknown> {
    const where: Record<string, unknown> = { status: { in: statuses } };
    if (filters?.commodity) where.commodity = filters.commodity;
    if (filters?.category) where.category = filters.category;
    if (filters?.unit) where.unit = filters.unit;
    if (filters?.location) where.location = { contains: filters.location, mode: "insensitive" };
    if (filters?.neededByFrom) where.neededBy = { gte: filters.neededByFrom };
    return where;
  }

  private enrich(row: unknown): EnrichedRequirement {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const committed = new Decimal(String(r.aggregation?.committedQuantity ?? "0"));
    const required = new Decimal(String(r.quantity));
    const remaining = required.minus(committed);
    return {
      ...toRequirementRecord(r),
      committedSupply: committed.toFixed(),
      remainingDemand: remaining.gt(0) ? remaining.toFixed() : "0",
    };
  }

  /** Discovery: open requirements with deterministic filters + pagination. */
  async findOpen(filters: RequirementFilters | undefined, page: number, limit: number): Promise<{ items: EnrichedRequirement[]; total: number; totalPages: number }> {
    const where = this.buildWhere(filters, OPEN_STATUSES);
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.requirement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { buyer: { select: { displayName: true } }, aggregation: { select: { committedQuantity: true } } },
      }),
      this.prisma.requirement.count({ where }),
    ]);
    return { items: rows.map((r) => this.enrich(r)), total, totalPages: Math.ceil(total / limit) };
  }

  /** The buyer's own requirements (any status), newest first, with pagination. */
  async findMine(buyerId: string, page: number, limit: number): Promise<{ items: EnrichedRequirement[]; total: number; totalPages: number }> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.requirement.findMany({
        where: { buyerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { buyer: { select: { displayName: true } }, aggregation: { select: { committedQuantity: true } } },
      }),
      this.prisma.requirement.count({ where: { buyerId } }),
    ]);
    return { items: rows.map((r) => this.enrich(r)), total, totalPages: Math.ceil(total / limit) };
  }

  /**
   * View a requirement. Owners may view any of their own; other authenticated
   * users may view only OPEN/PARTIALLY_FULFILLED (discovery). Returns null when
   * not visible to the caller (route maps to 404).
   */
  async findById(id: string, viewerId: string): Promise<EnrichedRequirement | null> {
    const row = await this.prisma.requirement.findUnique({
      where: { id },
      include: { buyer: { select: { displayName: true } }, aggregation: { select: { committedQuantity: true } } },
    });
    if (!row) return null;
    const isOwner = row.buyerId === viewerId;
    if (!isOwner && !OPEN_STATUSES.includes(row.status as RequirementStatus)) return null;
    return this.enrich(row);
  }

  /** Owner edits; permitted only while OPEN (no commitments exist yet). */
  async update(id: string, input: UpdateRequirementInput, ownerId: string): Promise<RequirementRecord> {
    const existing = await this.prisma.requirement.findUnique({ where: { id }, select: { buyerId: true, status: true } });
    if (!existing) notFoundError(`Requirement not found: ${id}`);
    if (existing.buyerId !== ownerId) forbiddenError("Only the owner can update this requirement");
    if (existing.status !== "OPEN") {
      conflictError(`A requirement in status ${existing.status} can no longer be edited`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const src = input as Record<string, any>;
    const data: Record<string, unknown> = {};
    for (const key of ["title", "description", "qualityNotes", "category", "commodity", "unit", "location", "currency"]) {
      if (src[key] !== undefined) data[key] = src[key];
    }
    if (src.quantity !== undefined) data.quantity = src.quantity.toString();
    if (src.targetPrice !== undefined) data.targetPrice = src.targetPrice === null ? null : src.targetPrice.toString();
    if (src.neededBy !== undefined) data.neededBy = src.neededBy;

    const updated = await this.prisma.requirement.update({ where: { id }, data });
    await auditLog({ actorId: ownerId, actorType: "PROFILE", entityType: "requirement", entityId: id, action: "REQUIREMENT_UPDATED", payload: { fields: Object.keys(data) }, prismaClient: this.prisma });
    return toRequirementRecord(updated);
  }


  /**
   * Buyer cancels their requirement. Allowed from OPEN/PARTIALLY_FULFILLED, but
   * only when nothing is committed/fulfilled (committed supply holds reserved
   * inventory and must be cancelled contribution-by-contribution first). Any
   * remaining PROPOSED contributions are cancelled (no inventory effect).
   */
  async cancel(id: string, ownerId: string): Promise<RequirementRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const requirement = await tx.requirement.findUnique({
        where: { id },
        select: { id: true, buyerId: true, status: true, aggregation: { select: { id: true, committedQuantity: true } } },
      });
      if (!requirement) notFoundError(`Requirement not found: ${id}`);
      if (requirement.buyerId !== ownerId) forbiddenError("Only the owner can cancel this requirement");
      if (requirement.status !== "OPEN" && requirement.status !== "PARTIALLY_FULFILLED") {
        badRequestError(`A requirement in status ${requirement.status} cannot be cancelled`);
      }
      const committed = new Decimal(String(requirement.aggregation?.committedQuantity ?? "0"));
      if (committed.gt(0)) {
        conflictError("Cancel the committed contributions before cancelling this requirement");
      }

      await tx.contribution.updateMany({
        where: { aggregationId: requirement.aggregation.id, status: "PROPOSED" },
        data: { status: "CANCELLED" },
      });
      await tx.aggregation.update({ where: { id: requirement.aggregation.id }, data: { status: "CANCELLED" } });
      const updated = await tx.requirement.update({ where: { id }, data: { status: "CANCELLED" } });

      await auditLog({ actorId: ownerId, actorType: "PROFILE", entityType: "requirement", entityId: id, action: "REQUIREMENT_CANCELLED", prismaClient: tx });
      return toRequirementRecord(updated);
    });
  }

  /** Aggregation view: derived totals + contributions (visible to participants). */
  async getAggregation(requirementId: string, viewerId: string): Promise<AggregationView | null> {
    const requirement = await this.prisma.requirement.findUnique({
      where: { id: requirementId },
      select: {
        id: true, buyerId: true, quantity: true, unit: true, status: true,
        aggregation: { select: { id: true, status: true, contributions: { include: { seller: { select: { displayName: true } }, listing: { select: { title: true } } }, orderBy: { createdAt: "asc" } } } },
      },
    });
    if (!requirement || !requirement.aggregation) return null;
    const isOwner = requirement.buyerId === viewerId;
    if (!isOwner && !OPEN_STATUSES.includes(requirement.status as RequirementStatus)) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = requirement.aggregation.contributions as any[];
    const committedSupply = sumQuantities(rows.filter((c) => COMMITTED_SUPPLY_STATUSES.includes(c.status)).map((c) => String(c.quantity)));
    const fulfilled = sumQuantities(rows.filter((c) => c.status === "FULFILLED").map((c) => String(c.quantity)));
    const required = new Decimal(String(requirement.quantity));
    const remaining = required.minus(committedSupply);

    return {
      aggregationId: requirement.aggregation.id,
      requirementId: requirement.id,
      requirementStatus: requirement.status,
      aggregationStatus: requirement.aggregation.status,
      requiredQuantity: required.toFixed(),
      unit: requirement.unit,
      committedSupply: committedSupply.toFixed(),
      fulfilledQuantity: fulfilled.toFixed(),
      remainingDemand: remaining.gt(0) ? remaining.toFixed() : "0",
      contributions: rows.map((c) => toContributionRecord(c)),
    };
  }

}
