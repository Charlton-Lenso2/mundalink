// Listing domain types.
//
// Listing status lifecycle:
//   DRAFT -> ACTIVE   (publish)
//   DRAFT | ACTIVE -> REJECTED (seller rejects their own listing)
//   ACTIVE | REJECTED -> DRAFT (draft is reusable)
//
// Money/quantity use Decimal (arbitrary precision); the DB stores them as
// NUMERIC(20,6). No float arithmetic for financial fields.

import { Decimal } from "decimal.js";

export type ListingStatus = "DRAFT" | "ACTIVE" | "REJECTED" | "SOLD";

export const LISTING_STATUS: Record<ListingStatus, ListingStatus> = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  SOLD: "SOLD",
};

export interface CreateListingInput {
  sellerId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  commodity?: string | null;
  quantity: Decimal;
  unit?: string | null;
  pricePerUnit: Decimal;
  currency?: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  availableQuantity: Decimal;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  category?: string;
  commodity?: string;
  quantity?: Decimal;
  unit?: string;
  pricePerUnit?: Decimal;
  currency?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  availableQuantity?: Decimal;
  status?: ListingStatus;
}

export interface ListingRecord {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  category: string | null;
  commodity: string | null;
  quantity: string;
  unit: string | null;
  pricePerUnit: string;
  currency: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ListingStatus;
  availableQuantity: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toListingRecord(
  l: {
    id: string;
    sellerId: string;
    title: string;
    description: string | null;
    category: string | null;
    commodity: string | null;
    quantity: unknown;
    unit: string | null;
    pricePerUnit: unknown;
    currency: string;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    availableQuantity: unknown;
    createdAt: Date;
    updatedAt: Date;
  }
): ListingRecord {
  return {
    id: l.id,
    sellerId: l.sellerId,
    title: l.title,
    description: l.description,
    category: l.category,
    commodity: l.commodity,
    quantity: String(l.quantity),
    unit: l.unit,
    pricePerUnit: String(l.pricePerUnit),
    currency: l.currency,
    location: l.location,
    latitude: l.latitude,
    longitude: l.longitude,
    status: l.status as ListingStatus,
    availableQuantity: String(l.availableQuantity),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
