// Agreed-deal (commitment) domain types.
//
// A deal is created exactly once per accepted offer (unique on offerId).
// Deal statuses: PENDING -> CONFIRMED -> COMPLETED, or PENDING -> CANCELLED.
// CONFIRMED -> CANCELLED is allowed; COMPLETED and CANCELLED are terminal.
// Deals are never hard-deleted.

export type DealStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export const DEAL_STATUS: Record<DealStatus, DealStatus> = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

export interface DealRecord {
  id: string;
  offerId: string;
  listingId: string;
  agreedQuantity: string;
  agreedPrice: string;
  status: DealStatus;
  buyerId: string;
  sellerId: string;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  listingTitle?: string;
  currency?: string;
  unit?: string | null;
  buyerName?: string;
  sellerName?: string;
}

export function toDealRecord(d: {
  id: string;
  offerId: string;
  listingId: string;
  agreedQuantity: unknown;
  agreedPrice: unknown;
  status: string;
  buyerId: string;
  sellerId: string;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  listing?: { title: string; currency: string; unit: string | null } | null;
  buyer?: { displayName: string | null } | null;
  seller?: { displayName: string | null } | null;
}): DealRecord {
  return {
    id: d.id,
    offerId: d.offerId,
    listingId: d.listingId,
    agreedQuantity: String(d.agreedQuantity),
    agreedPrice: String(d.agreedPrice),
    status: d.status as DealStatus,
    buyerId: d.buyerId,
    sellerId: d.sellerId,
    executedAt: d.executedAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    ...(d.listing
      ? {
          listingTitle: d.listing.title,
          currency: d.listing.currency,
          unit: d.listing.unit,
        }
      : {}),
    ...(d.buyer?.displayName ? { buyerName: d.buyer.displayName } : {}),
    ...(d.seller?.displayName ? { sellerName: d.seller.displayName } : {}),
  };
}
