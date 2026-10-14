// Contribution + Aggregation domain types.
//
// Contribution lifecycle (binding step = COMMITTED, which reserves inventory):
//   PROPOSED -> COMMITTED -> FULFILLED
//   PROPOSED | COMMITTED -> CANCELLED   (COMMITTED cancellation restores inventory)
// PROPOSED is a non-binding proposal: it never touches inventory or committed
// totals. Only COMMITTED counts toward committed supply and reserves stock.

import { Decimal } from "decimal.js";

export type ContributionStatus = "PROPOSED" | "COMMITTED" | "FULFILLED" | "CANCELLED";

export const CONTRIBUTION_STATUS: Record<ContributionStatus, ContributionStatus> = {
  PROPOSED: "PROPOSED",
  COMMITTED: "COMMITTED",
  FULFILLED: "FULFILLED",
  CANCELLED: "CANCELLED",
};

// Statuses that still hold reserved inventory / count as committed supply.
export const COMMITTED_SUPPLY_STATUSES: ContributionStatus[] = ["COMMITTED", "FULFILLED"];

// Statuses considered "active" for the one-active-contribution-per-listing rule.
export const ACTIVE_CONTRIBUTION_STATUSES: ContributionStatus[] = ["PROPOSED", "COMMITTED", "FULFILLED"];

export interface ContributionRecord {
  id: string;
  aggregationId: string;
  listingId: string;
  sellerId: string;
  sellerName?: string;
  listingTitle?: string;
  quantity: string;
  unit: string;
  status: ContributionStatus;
  createdAt: Date;
  updatedAt: Date;
}

type ContributionRow = {
  id: string;
  aggregationId: string;
  listingId: string;
  sellerId: string;
  quantity: unknown;
  unit: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  seller?: { displayName: string | null } | null;
  listing?: { title: string } | null;
};

export function toContributionRecord(c: ContributionRow): ContributionRecord {
  return {
    id: c.id,
    aggregationId: c.aggregationId,
    listingId: c.listingId,
    sellerId: c.sellerId,
    ...(c.seller?.displayName ? { sellerName: c.seller.displayName } : {}),
    ...(c.listing?.title ? { listingTitle: c.listing.title } : {}),
    quantity: String(c.quantity),
    unit: c.unit,
    status: c.status as ContributionStatus,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Aggregation view: requirement totals + contributions, all server-derived. */
export interface AggregationView {
  aggregationId: string;
  requirementId: string;
  requirementStatus: string;
  aggregationStatus: string;
  requiredQuantity: string;
  unit: string;
  committedSupply: string;
  fulfilledQuantity: string;
  remainingDemand: string;
  contributions: ContributionRecord[];
}

/** Sum an array of Decimal-string quantities. */
export function sumQuantities(values: string[]): Decimal {
  return values.reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0));
}
