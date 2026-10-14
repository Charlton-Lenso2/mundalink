// Contribution service: seller proposals + binding commitments toward a buyer
// requirement, with guarded, transactional inventory and demand protection.
//
// PROPOSED is a non-binding proposal (never touches inventory or committed
// totals). COMMITTED is the binding step: it reserves listing inventory via a
// guarded decrement AND reserves buyer demand via a guarded increment on
// Aggregation.committedQuantity (column-vs-constant guard, so concurrent commits
// cannot over-commit). FULFILLED = delivered (subset of committed; no inventory
// change). Cancelling a COMMITTED contribution restores inventory + demand.
//
// Units combine only on EXACT match (no conversion). See docs/api-contract.md.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";
import { toContributionRecord, ACTIVE_CONTRIBUTION_STATUSES, COMMITTED_SUPPLY_STATUSES, sumQuantities, type ContributionRecord } from "../types/contribution";
import { auditLog } from "../auditLog";
import { badRequestError, conflictError, forbiddenError, notFoundError } from "../../middleware/error-handler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

const CONTRIB_INCLUDE = { seller: { select: { displayName: true } }, listing: { select: { title: true } } } as const;

export class ContributionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * A SELLER proposes a quantity from their own listing toward a requirement.
   * Non-binding: creates a PROPOSED contribution only. Validates ownership,
   * ACTIVE listing, exact unit match, availability, and remaining demand.
   */
  async propose(requirementId: string, sellerId: string, listingId: string, quantity: Decimal): Promise<ContributionRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const requirement = await tx.requirement.findUnique({
        where: { id: requirementId },
        select: { id: true, status: true, quantity: true, unit: true, aggregation: { select: { id: true, committedQuantity: true } } },
      });
      if (!requirement || !requirement.aggregation) notFoundError("Requirement not found");
      if (requirement.status !== "OPEN" && requirement.status !== "PARTIALLY_FULFILLED") {
        badRequestError(`Requirement is not accepting contributions (status ${requirement.status})`);
      }

      const listing = await tx.listing.findUnique({
        where: { id: listingId },
        select: { id: true, sellerId: true, status: true, availableQuantity: true, unit: true, inventory: { select: { availableQuantity: true } } },
      });
      if (!listing) notFoundError("Listing not found");
      if (listing.sellerId !== sellerId) forbiddenError("You can only contribute from your own listing");
      if (listing.status !== "ACTIVE") badRequestError("Listing is not active");

      // Exact unit match — never convert.
      if ((listing.unit ?? "") !== requirement.unit) {
        badRequestError(`Unit mismatch: listing unit "${listing.unit ?? ""}" does not match requirement unit "${requirement.unit}" (no conversion)`);
      }

      // A proposal must not promise more than is currently available.
      const available = new Decimal(String(listing.inventory?.availableQuantity ?? listing.availableQuantity));
      if (quantity.gt(available)) conflictError("Contribution quantity exceeds available inventory");

      const committed = new Decimal(String(requirement.aggregation.committedQuantity));
      const remaining = new Decimal(String(requirement.quantity)).minus(committed);
      if (quantity.gt(remaining)) conflictError("Contribution quantity exceeds remaining buyer demand");

      // No duplicate active contribution from this listing for this aggregation.
      const activeExisting = await tx.contribution.findFirst({
        where: { aggregationId: requirement.aggregation.id, listingId, status: { in: ACTIVE_CONTRIBUTION_STATUSES } },
        select: { id: true },
      });
      if (activeExisting) conflictError("This listing already has an active contribution to this requirement");

      const contribution = await tx.contribution.create({
        data: {
          aggregationId: requirement.aggregation.id,
          listingId,
          sellerId,
          quantity: quantity.toString(),
          unit: requirement.unit,
          status: "PROPOSED",
        },
        include: CONTRIB_INCLUDE,
      });
      await auditLog({ actorId: sellerId, actorType: "PROFILE", entityType: "contribution", entityId: contribution.id, action: "CONTRIBUTION_PROPOSED", payload: { requirementId, listingId, quantity: quantity.toString() }, prismaClient: tx });
      return toContributionRecord(contribution);
    });
  }

  /**
   * BUYER commits a PROPOSED contribution -> binding COMMITTED.
   *
   * This is the ONLY binding step. Inside one transaction it:
   *   1. claims the contribution (PROPOSED -> COMMITTED compare-and-set, so a
   *      concurrent commit/cancel/fulfil cannot also win),
   *   2. reserves listing inventory via a guarded decrement
   *      (WHERE available >= qty; never goes negative),
   *   3. reserves buyer demand via a guarded increment on
   *      Aggregation.committedQuantity
   *      (WHERE committed + qty <= required; concurrent commits cannot
   *      over-commit — this is the same guarded-UPDATE pattern as
   *      OfferAcceptanceService.accept),
   *   4. flips the requirement OPEN -> PARTIALLY_FULFILLED.
   *
   * Any guard failure rolls the whole transaction back (409): nothing is
   * reserved, nothing is partially written.
   */
  async commit(contributionId: string, buyerId: string): Promise<ContributionRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const contribution = await tx.contribution.findUnique({
        where: { id: contributionId },
        select: {
          id: true, quantity: true, unit: true, status: true, listingId: true,
          aggregation: {
            select: {
              id: true,
              requirement: { select: { id: true, buyerId: true, quantity: true, unit: true, status: true } },
            },
          },
        },
      });
      if (!contribution || !contribution.aggregation?.requirement) notFoundError("Contribution not found");
      const requirement = contribution.aggregation.requirement;
      if (requirement.buyerId !== buyerId) forbiddenError("Only the requirement owner can commit contributions");
      if (requirement.status !== "OPEN" && requirement.status !== "PARTIALLY_FULFILLED") {
        badRequestError(`Requirement is not accepting commitments (status ${requirement.status})`);
      }
      // Exact unit match — the requirement and contribution units were fixed at
      // propose time; re-check server-side (never convert).
      if (contribution.unit !== requirement.unit) {
        badRequestError(`Unit mismatch: contribution unit "${contribution.unit}" does not match requirement unit "${requirement.unit}" (no conversion)`);
      }

      const qty = new Decimal(String(contribution.quantity));

      // Claim first (compare-and-set): exactly one concurrent
      // commit/cancel/fulfil can win; retries of the same commit after success
      // land on the status check below (409, idempotent-safe).
      const claimed = await tx.contribution.updateMany({
        where: { id: contributionId, status: "PROPOSED" },
        data: { status: "COMMITTED" },
      });
      if (claimed.count !== 1) {
        conflictError(`Contribution is no longer proposed (a concurrent operation may have won)`);
      }

      // Guarded inventory reservation: WHERE available >= qty.
      const reserved = await tx.inventory.updateMany({
        where: { listingId: contribution.listingId, availableQuantity: { gte: qty.toString() } },
        data: { availableQuantity: { decrement: qty.toString() } },
      });
      if (reserved.count !== 1) {
        conflictError("Insufficient listing inventory for this commitment");
      }
      // Keep the listing mirror in sync inside the same transaction.
      await tx.listing.updateMany({
        where: { id: contribution.listingId },
        data: { availableQuantity: { decrement: qty.toString() } },
      });

      // Guarded demand reservation: WHERE committed + qty <= required.
      // Prisma updateMany `where` cannot reference another column, so the guard
      // is expressed as committed <= required - qty (same check, column vs
      // constant). The DB evaluates it atomically with the increment.
      const required = new Decimal(String(requirement.quantity));
      const ceiling = required.minus(qty);
      const demandReserved = await tx.aggregation.updateMany({
        where: { id: contribution.aggregation.id, committedQuantity: { lte: ceiling.toString() } },
        data: { committedQuantity: { increment: qty.toString() } },
      });
      if (demandReserved.count !== 1) {
        conflictError("Commitment would exceed remaining buyer demand");
      }

      if (requirement.status === "OPEN") {
        await tx.requirement.update({ where: { id: requirement.id }, data: { status: "PARTIALLY_FULFILLED" } });
      }

      await auditLog({ actorId: buyerId, actorType: "PROFILE", entityType: "contribution", entityId: contributionId, action: "CONTRIBUTION_COMMITTED", payload: { quantity: qty.toString() }, prismaClient: tx });
      const updated = await tx.contribution.findUnique({ where: { id: contributionId }, include: CONTRIB_INCLUDE });
      if (!updated) notFoundError("Contribution not found");
      return toContributionRecord(updated);
    });
  }

  /**
   * BUYER marks a COMMITTED contribution FULFILLED (delivered).
   *
   * No inventory change (it was already reserved at commit). FULFILLED stays in
   * committed supply (it is a subset of what was committed). When fulfilled
   * supply covers the full requirement, the requirement (and aggregation)
   * flip to FULFILLED — the ONLY path to FULFILLED. Retrying fulfil on an
   * already-FULFILLED contribution returns 409 (no double fulfilment).
   */
  async fulfil(contributionId: string, buyerId: string): Promise<ContributionRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const contribution = await tx.contribution.findUnique({
        where: { id: contributionId },
        select: {
          id: true, quantity: true, status: true, aggregationId: true,
          aggregation: {
            select: {
              id: true,
              requirement: { select: { id: true, buyerId: true, quantity: true, status: true } },
            },
          },
        },
      });
      if (!contribution || !contribution.aggregation?.requirement) notFoundError("Contribution not found");
      const requirement = contribution.aggregation.requirement;
      if (requirement.buyerId !== buyerId) forbiddenError("Only the requirement owner can mark fulfilment");

      // Compare-and-set claim: duplicate fulfil requests cannot both win.
      const claimed = await tx.contribution.updateMany({
        where: { id: contributionId, status: "COMMITTED" },
        data: { status: "FULFILLED" },
      });
      if (claimed.count !== 1) {
        conflictError("Only a COMMITTED contribution can be fulfilled (duplicate fulfilment is rejected)");
      }

      // Recompute fulfilled supply from the DB inside the tx, then flip the
      // requirement to FULFILLED only when deliveries cover the full quantity.
      const rows = await tx.contribution.findMany({
        where: { aggregationId: contribution.aggregationId, status: { in: COMMITTED_SUPPLY_STATUSES } },
        select: { quantity: true, status: true },
      });
      const fulfilled = sumQuantities(rows.filter((r: { status: string }) => r.status === "FULFILLED").map((r: { quantity: unknown }) => String(r.quantity)));
      const required = new Decimal(String(requirement.quantity));
      if (fulfilled.gte(required)) {
        await tx.requirement.update({ where: { id: requirement.id }, data: { status: "FULFILLED" } });
        await tx.aggregation.update({ where: { id: contribution.aggregation.id }, data: { status: "CLOSED" } });
      }

      await auditLog({ actorId: buyerId, actorType: "PROFILE", entityType: "contribution", entityId: contributionId, action: "CONTRIBUTION_FULFILLED", payload: { quantity: String(contribution.quantity) }, prismaClient: tx });
      const updated = await tx.contribution.findUnique({ where: { id: contributionId }, include: CONTRIB_INCLUDE });
      if (!updated) notFoundError("Contribution not found");
      return toContributionRecord(updated);
    });
  }

  /**
   * Cancel a contribution.
   *
   *   - PROPOSED: only the contributing SELLER cancels. No inventory or demand
   *     effect (proposals never reserved anything).
   *   - COMMITTED: only the requirement-owner BUYER cancels. The reserved
   *     inventory is restored (guarded increment back + listing mirror) and
   *     the demand reservation is released via an atomic
   *     GREATEST(committed - qty, 0) update — cancellation can never drive
   *     committed supply negative. If nothing remains committed and the
   *     requirement was PARTIALLY_FULFILLED, it re-opens to OPEN.
   *   - FULFILLED can never be cancelled (delivery already recorded).
   *   - CANCELLED -> 409 (idempotent-safe conflict, not a silent no-op).
   */
  async cancel(contributionId: string, actorId: string): Promise<ContributionRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const contribution = await tx.contribution.findUnique({
        where: { id: contributionId },
        select: {
          id: true, quantity: true, status: true, listingId: true, sellerId: true,
          aggregationId: true,
          aggregation: {
            select: {
              id: true,
              requirement: { select: { id: true, buyerId: true, status: true } },
            },
          },
        },
      });
      if (!contribution || !contribution.aggregation?.requirement) notFoundError("Contribution not found");
      const requirement = contribution.aggregation.requirement;

      if (contribution.status === "PROPOSED") {
        if (contribution.sellerId !== actorId) forbiddenError("Only the contributing seller can cancel a proposed contribution");
        const claimed = await tx.contribution.updateMany({
          where: { id: contributionId, status: "PROPOSED" },
          data: { status: "CANCELLED" },
        });
        if (claimed.count !== 1) conflictError("Contribution is no longer proposed");
        await auditLog({ actorId, actorType: "PROFILE", entityType: "contribution", entityId: contributionId, action: "CONTRIBUTION_CANCELLED", payload: { from: "PROPOSED" }, prismaClient: tx });
      } else if (contribution.status === "COMMITTED") {
        if (requirement.buyerId !== actorId) forbiddenError("Only the requirement owner can cancel a committed contribution");
        const claimed = await tx.contribution.updateMany({
          where: { id: contributionId, status: "COMMITTED" },
          data: { status: "CANCELLED" },
        });
        if (claimed.count !== 1) conflictError("Contribution is no longer committed");

        const qty = new Decimal(String(contribution.quantity));
        await tx.inventory.updateMany({
          where: { listingId: contribution.listingId },
          data: { availableQuantity: { increment: qty.toString() } },
        });
        await tx.listing.updateMany({
          where: { id: contribution.listingId },
          data: { availableQuantity: { increment: qty.toString() } },
        });
        await tx.$executeRawUnsafe(
          `UPDATE "aggregations" SET "committedQuantity" = GREATEST("committedQuantity" - $1, 0), "updatedAt" = NOW() WHERE "id" = $2`,
          qty.toString(),
          contribution.aggregation.id
        );

        const remaining = await tx.contribution.findFirst({
          where: { aggregationId: contribution.aggregationId, status: { in: COMMITTED_SUPPLY_STATUSES } },
          select: { id: true },
        });
        if (!remaining && requirement.status === "PARTIALLY_FULFILLED") {
          await tx.requirement.update({ where: { id: requirement.id }, data: { status: "OPEN" } });
        }
        await auditLog({ actorId, actorType: "PROFILE", entityType: "contribution", entityId: contributionId, action: "CONTRIBUTION_CANCELLED", payload: { from: "COMMITTED", quantity: qty.toString() }, prismaClient: tx });
      } else if (contribution.status === "FULFILLED") {
        badRequestError("A FULFILLED contribution cannot be cancelled (delivery already recorded)");
      } else {
        conflictError("Contribution is already cancelled");
      }

      const updated = await tx.contribution.findUnique({ where: { id: contributionId }, include: CONTRIB_INCLUDE });
      if (!updated) notFoundError("Contribution not found");
      return toContributionRecord(updated);
    });
  }
}
