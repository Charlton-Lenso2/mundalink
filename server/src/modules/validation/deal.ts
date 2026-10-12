// Deal request-body validation (route layer).
// Deal statuses: PENDING -> CONFIRMED -> COMPLETED, or PENDING/CONFIRMED -> CANCELLED.
// COMPLETED and CANCELLED are terminal. Never trust client-supplied ownership.

import { badRequestError } from "../../middleware/error-handler";
import { DEAL_STATUS, type DealStatus } from "../types/deal";

const TRANSITION_TARGETS: DealStatus[] = [
  DEAL_STATUS.CONFIRMED,
  DEAL_STATUS.COMPLETED,
  DEAL_STATUS.CANCELLED,
];

export class DealBodyValidation {
  static status(input: unknown): { status: DealStatus } {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;
    if (typeof body.status !== "string") badRequestError("status is required");
    const s = (body.status as string).toUpperCase() as DealStatus;
    if (!TRANSITION_TARGETS.includes(s)) {
      badRequestError("status must be one of CONFIRMED, COMPLETED, CANCELLED");
    }
    return { status: s };
  }
}
