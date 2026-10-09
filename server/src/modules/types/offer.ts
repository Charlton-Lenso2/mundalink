// Offer domain types + validation rules.
//
// Offer statuses: PENDING, ACCEPTED, DECLINED, WITHDRAWN, EXPIRED.
//
// Offer status transitions (enforced at the offer controller):
//   PENDING -> ACCEPTED (listing owner accepts)
//   PENDING -> DECLINED (listing owner declines)
//   PENDING -> WITHDRAWN (offer owner withdraws)
//   PENDING -> EXPIRED (time passes; computed by listing owner 'expires')
//   ACCEPTED -> DEAL_EXECUTED (side effect)
//   DECLINED | WITHDRAWN | EXPIRED -> terminal

import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";

export const OfferStatus = {
  PENDING: "PENDING" as const,
  ACCEPTED: "ACCEPTED" as const,
  DECLINED: "DECLINED" as const,
  WITHDRAWN: "WITHDRAWN" as const,
  EXPIRED: "EXPIRED" as const,
} as const;

export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const OFFER_STATUS: Record<OfferStatus, OfferStatus> = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  DECLINED: "DECLINED",
  WITHDRAWN: "WITHDRAWN",
  EXPIRED: "EXPIRED",
};

export interface CreateOfferInput {
  buyerId: string;
  listingId: string;
  offeredQuantity: Decimal;
  offeredPrice: Decimal;
  message?: string | null;
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

export class OfferValidation {
  static create(input: unknown): CreateOfferInput {
    if (!input || typeof input !== "object") {
      throw badRequestError("Request body must be an object");
    }
    const body = input as Record<string, unknown>;

    const listingId = this.requiredString(body, "listingId");
    const buyerId = this.requiredString(body, "buyerId");
    const offeredQuantity = this.positiveDecimal(body, "offeredQuantity");
    const offeredPrice = this.nonNegativeDecimal(body, "offeredPrice");
    const message = this.optionalString(body, "message", 5_000);

    return { buyerId, listingId, offeredQuantity, offeredPrice, message };
  }

  static updateStatus(
    input: unknown,
    current: string
  ): { status: OfferStatus; expiresAt: string | null } {
    if (!input || typeof input !== "object") {
      throw badRequestError("Request body must be an object");
    }
    const body = input as Record<string, unknown>;

    if (body.status === undefined) {
      throw badRequestError("Request body must include 'status'");
    }
    const status = body.status as string;
    const allowed = ["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN", "EXPIRED"];
    if (!allowed.includes(status)) {
      throw badRequestError(`invalid offer status: ${status}`);
    }

    const expiresAt = body.expiresAt === undefined ? null : String(body.expiresAt);
    return { status: status as OfferStatus, expiresAt };
  }

  private static requiredString(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== "string" || value.length === 0) {
      throw badRequestError(`${key} is required and must be a non-empty string`);
    }
    return value;
  }

  private static optionalString(body: Record<string, unknown>, key: string, max: number): string | null {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > max) {
      throw badRequestError(`${key} must be a string of <= ${max} characters`);
    }
    return value;
  }

  private static positiveDecimal(body: Record<string, unknown>, key: string): Decimal {
    const value = body[key];
    if (value === undefined || value === null) {
      throw badRequestError(`${key} is required and must be a positive decimal`);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Decimal(value);
    }
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      return new Decimal(value.trim());
    }
    throw badRequestError(`${key} must be a positive decimal number`);
  }

  private static nonNegativeDecimal(body: Record<string, unknown>, key: string): Decimal {
    const value = body[key];
    if (value === undefined || value === null) {
      throw badRequestError(`${key} is required and must be a non-negative decimal`);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Decimal(value);
    }
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      return new Decimal(value.trim());
    }
    throw badRequestError(`${key} must be a non-negative decimal number`);
  }
}

export function toOfferRecord(o: {
  id: string;
  buyerId: string;
  listingId: string;
  offeredQuantity: unknown;
  offeredPrice: unknown;
  message: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}): OfferRecord {
  return {
    id: o.id,
    buyerId: o.buyerId,
    listingId: o.listingId,
    offeredQuantity: String(o.offeredQuantity),
    offeredPrice: String(o.offeredPrice),
    message: o.message,
    status: o.status as OfferStatus,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    expiresAt: o.expiresAt,
  };
}

