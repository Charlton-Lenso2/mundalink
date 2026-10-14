// Contribution (propose) request-body validation.
//
// The seller supplies only which listing and how much. The unit is NOT taken
// from the body — it is read server-side from the requirement and must exactly
// match the listing's unit (no conversion). Ownership/status are server-driven.

import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";
import { validateStoredDecimal } from "./numeric";

export interface ParsedProposeContribution {
  listingId: string;
  quantity: Decimal;
}

export class ContributionValidation {
  static propose(input: unknown): ParsedProposeContribution {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;

    const listingId = body.listingId;
    if (typeof listingId !== "string" || listingId.length === 0) {
      badRequestError("listingId is required and must be a non-empty string");
    }

    let quantity: Decimal;
    try {
      quantity = new Decimal(String(body.quantity));
    } catch {
      badRequestError("quantity must be a positive decimal number");
    }
    if (!quantity.isFinite() || quantity.lte(0)) badRequestError("quantity must be greater than zero");
    validateStoredDecimal(quantity, "quantity");

    return { listingId, quantity };
  }
}
