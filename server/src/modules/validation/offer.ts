// Offer request-body validation (route layer).
// Never trusts buyerId from the body: routes overwrite it with req.firebaseUid.

import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";
import { OFFER_STATUS, type OfferStatus } from "../types/offer";

export interface ParsedCreateOffer {
  listingId: string;
  offeredQuantity: Decimal;
  offeredPrice: Decimal;
  message: string | null;
}

const STATUSES: OfferStatus[] = [
  OFFER_STATUS.ACCEPTED,
  OFFER_STATUS.DECLINED,
  OFFER_STATUS.WITHDRAWN,
  OFFER_STATUS.EXPIRED,
];

export class OfferBodyValidation {
  static create(input: unknown): ParsedCreateOffer {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;
    const listingId = OfferBodyValidation.nonEmpty(body, "listingId");
    const offeredQuantity = OfferBodyValidation.positiveDecimal(body, "offeredQuantity");
    const offeredPrice = OfferBodyValidation.nonNegativeDecimal(body, "offeredPrice");
    const message =
      body.message === undefined || body.message === null
        ? null
        : typeof body.message === "string" && body.message.length <= 5000
          ? body.message
          : (() => {
              badRequestError("message must be a string of <= 5000 characters");
            })();
    return { listingId, offeredQuantity, offeredPrice, message: message ?? null };
  }

  static status(input: unknown): { status: OfferStatus } {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;
    if (typeof body.status !== "string") badRequestError("status is required");
    const s = (body.status as string).toUpperCase() as OfferStatus;
    if (!STATUSES.includes(s)) {
      badRequestError("status must be one of ACCEPTED, DECLINED, WITHDRAWN, EXPIRED");
    }
    return { status: s };
  }

  private static nonEmpty(body: Record<string, unknown>, key: string): string {
    const v = body[key];
    if (typeof v !== "string" || v.length === 0) badRequestError(`${key} is required`);
    return v as string;
  }

  private static positiveDecimal(body: Record<string, unknown>, key: string): Decimal {
    const v = body[key];
    try {
      const d = new Decimal(String(v));
      if (d.lte(0)) badRequestError(`${key} must be positive`);
      return d;
    } catch {
      badRequestError(`${key} must be a positive decimal number`);
    }
  }

  private static nonNegativeDecimal(body: Record<string, unknown>, key: string): Decimal {
    const v = body[key];
    try {
      const d = new Decimal(String(v));
      if (d.lt(0)) badRequestError(`${key} must be non-negative`);
      return d;
    } catch {
      badRequestError(`${key} must be a non-negative decimal number`);
    }
  }
}
