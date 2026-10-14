// Buyer Requirement domain types.
//
// A Requirement is buyer demand. Status lifecycle (server-driven only):
//   OPEN -> PARTIALLY_FULFILLED -> FULFILLED   (FULFILLED requires actual
//          fulfilment of the full quantity, never mere proposals/commitments)
//   OPEN | PARTIALLY_FULFILLED -> CANCELLED    (buyer; only with no committed
//                                              or fulfilled contributions)
//   EXPIRED is reserved (e.g. neededBy passed); not set via the API in this phase.
// Money/quantity use Decimal (NUMERIC(20,6)); units combine only on exact match.

import { Decimal } from "decimal.js";

export type RequirementStatus = "OPEN" | "PARTIALLY_FULFILLED" | "FULFILLED" | "CANCELLED" | "EXPIRED";

export const REQUIREMENT_STATUS: Record<RequirementStatus, RequirementStatus> = {
  OPEN: "OPEN",
  PARTIALLY_FULFILLED: "PARTIALLY_FULFILLED",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
};

export const OPEN_REQUIREMENT_STATUSES: RequirementStatus[] = ["OPEN", "PARTIALLY_FULFILLED"];

export interface CreateRequirementInput {
  buyerId: string;
  title: string;
  description?: string | null;
  qualityNotes?: string | null;
  category?: string | null;
  commodity?: string | null;
  quantity: Decimal;
  unit: string;
  location?: string | null;
  neededBy?: Date | null;
  targetPrice?: Decimal | null;
  currency?: string;
}

export interface UpdateRequirementInput {
  title?: string;
  description?: string | null;
  qualityNotes?: string | null;
  category?: string | null;
  commodity?: string | null;
  quantity?: Decimal;
  unit?: string;
  location?: string | null;
  neededBy?: Date | null;
  targetPrice?: Decimal | null;
  currency?: string;
}

export interface RequirementRecord {
  id: string;
  buyerId: string;
  buyerName?: string;
  title: string;
  description: string | null;
  qualityNotes: string | null;
  category: string | null;
  commodity: string | null;
  quantity: string;
  unit: string;
  location: string | null;
  neededBy: Date | null;
  targetPrice: string | null;
  currency: string;
  status: RequirementStatus;
  createdAt: Date;
  updatedAt: Date;
}

type RequirementRow = {
  id: string;
  buyerId: string;
  title: string;
  description: string | null;
  qualityNotes: string | null;
  category: string | null;
  commodity: string | null;
  quantity: unknown;
  unit: string;
  location: string | null;
  neededBy: Date | null;
  targetPrice: unknown;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  buyer?: { displayName: string | null } | null;
};

export function toRequirementRecord(r: RequirementRow): RequirementRecord {
  return {
    id: r.id,
    buyerId: r.buyerId,
    ...(r.buyer?.displayName ? { buyerName: r.buyer.displayName } : {}),
    title: r.title,
    description: r.description,
    qualityNotes: r.qualityNotes,
    category: r.category,
    commodity: r.commodity,
    quantity: String(r.quantity),
    unit: r.unit,
    location: r.location,
    neededBy: r.neededBy,
    targetPrice: r.targetPrice === null || r.targetPrice === undefined ? null : String(r.targetPrice),
    currency: r.currency,
    status: r.status as RequirementStatus,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
