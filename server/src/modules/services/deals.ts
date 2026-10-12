// Deal query + fulfilment-transition service: deals involving the user as
// buyer or seller, plus the PENDING -> CONFIRMED -> COMPLETED (or CANCELLED)
// lifecycle. COMPLETED/CANCELLED are terminal; deals are never hard-deleted.

import type { PrismaClient } from "@prisma/client";
import { toDealRecord, DEAL_STATUS, type DealRecord, type DealStatus } from "../types/deal";
import { badRequestError, forbiddenError, notFoundError } from "../../middleware/error-handler";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export class DealService {
  constructor(private readonly prisma: PrismaClient) {}

  async findMine(profileId: string): Promise<DealRecord[]> {
    const rows = await this.prisma.agreedDeal.findMany({
      where: { OR: [{ buyerId: profileId }, { sellerId: profileId }] },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDealRecord);
  }

  /**
   * Transition a deal's fulfilment status.
   * Both buyer and seller may confirm/cancel; only CONFIRMED deals complete.
   * Terminal states (COMPLETED/CANCELLED) never transition.
   */
  async transition(dealId: string, profileId: string, target: DealStatus): Promise<DealRecord> {
    return this.prisma.$transaction(async (tx: TxClient) => {
      const deal = await tx.agreedDeal.findUnique({ where: { id: dealId } });
      if (!deal) notFoundError(`Deal not found: ${dealId}`);
      if (deal.buyerId !== profileId && deal.sellerId !== profileId) {
        forbiddenError("Only the deal buyer or seller can update fulfilment");
      }

      const current = deal.status as DealStatus;
      if (current === DEAL_STATUS.COMPLETED || current === DEAL_STATUS.CANCELLED) {
        badRequestError(`Deal is already ${current} and cannot transition`);
      }

      const allowed: Record<DealStatus, DealStatus[]> = {
        PENDING: [DEAL_STATUS.CONFIRMED, DEAL_STATUS.CANCELLED],
        CONFIRMED: [DEAL_STATUS.COMPLETED, DEAL_STATUS.CANCELLED],
        COMPLETED: [],
        CANCELLED: [],
      };
      if (!allowed[current].includes(target)) {
        badRequestError(`Cannot move deal from ${current} to ${target}`);
      }

      const data: { status: DealStatus; executedAt?: Date } =
        target === DEAL_STATUS.COMPLETED
          ? { status: target, executedAt: new Date() }
          : { status: target };
      const updated = await tx.agreedDeal.update({ where: { id: dealId }, data });
      return toDealRecord(updated);
    });
  }

  /**
   * Participant-only status history for one deal, sourced from the audit log
   * (real recorded events only — never fabricated). Includes the deal's own
   * transitions (`entityType "deal"`) plus the `OFFER_ACCEPTED` event that
   * created it (`entityType "offer"`).
   */
  async history(dealId: string, profileId: string): Promise<DealHistoryEntry[]> {
    const deal = await this.prisma.agreedDeal.findUnique({
      where: { id: dealId },
      select: { id: true, buyerId: true, sellerId: true, offerId: true },
    });
    if (!deal) notFoundError(`Deal not found: ${dealId}`);
    if (deal.buyerId !== profileId && deal.sellerId !== profileId) {
      forbiddenError("Only the deal buyer or seller can read deal history");
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "deal", entityId: deal.id },
          { entityType: "offer", entityId: deal.offerId, action: "OFFER_ACCEPTED" },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, actorId: true, payload: true, createdAt: true },
    });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId ?? null,
      payload: parseAuditPayload(row.payload),
      createdAt: row.createdAt,
    }));
  }
}

export interface DealHistoryEntry {
  id: string;
  action: string;
  actorId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

function parseAuditPayload(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // Malformed/legacy payload — omit rather than fail the whole history read.
    return null;
  }
}
