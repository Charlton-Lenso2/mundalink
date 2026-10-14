export type CommodityCategory =
  | 'Cereals'
  | 'Legumes'
  | 'Vegetables'
  | 'Fruits'
  | 'Livestock'
  | 'Inputs'

export type ListingStatus = 'DRAFT' | 'ACTIVE' | 'REJECTED' | 'SOLD'
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED'
export type DealStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export interface Listing {
  id: string
  title: string
  description: string | null
  commodity: string | null
  category: string | null
  quantity: string
  unit: string | null
  pricePerUnit: string
  availableQuantity: string
  currency: string
  location: string | null
  sellerId: string
  sellerName?: string
  status: ListingStatus
  createdAt: string
  updatedAt?: string
}

export interface Offer {
  id: string
  listingId: string
  buyerId: string
  buyerName?: string
  sellerId?: string
  sellerName?: string
  listingTitle?: string
  unit?: string | null
  offeredQuantity: string
  offeredPrice: string
  currency?: string
  message: string | null
  status: OfferStatus
  createdAt: string
  updatedAt?: string
  expiresAt?: string | null
}

export interface Deal {
  id: string
  offerId: string
  listingId: string
  listingTitle?: string
  buyerId: string
  sellerId: string
  buyerName?: string
  sellerName?: string
  agreedQuantity: string
  agreedPrice: string
  currency?: string
  unit?: string | null
  status: DealStatus
  createdAt: string
  updatedAt?: string
  executedAt?: string | null
}

export interface Profile {
  id: string
  firebaseUid?: string
  displayName: string | null
  email: string | null
  phone: string | null
  city: string | null
  region: string | null
  country: string | null
  role: 'SELLER' | 'BUYER' | 'ADMIN' | 'OBSERVER'
  createdAt?: string
  updatedAt?: string
}

export type RequirementStatus = 'OPEN' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED' | 'EXPIRED'
export type ContributionStatus = 'PROPOSED' | 'COMMITTED' | 'FULFILLED' | 'CANCELLED'

export interface Requirement {
  id: string
  buyerId: string
  buyerName?: string
  title: string
  description: string | null
  qualityNotes: string | null
  category: string | null
  commodity: string | null
  quantity: string
  unit: string
  location: string | null
  neededBy: string | null
  targetPrice: string | null
  currency: string
  status: RequirementStatus
  createdAt: string
  updatedAt: string
}

export interface Contribution {
  id: string
  aggregationId: string
  listingId: string
  sellerId: string
  sellerName?: string
  listingTitle?: string
  quantity: string
  unit: string
  status: ContributionStatus
  createdAt: string
  updatedAt: string
}

export interface AggregationView {
  aggregationId: string
  requirementId: string
  requirementStatus: string
  aggregationStatus: string
  requiredQuantity: string
  unit: string
  committedSupply: string
  fulfilledQuantity: string
  remainingDemand: string
  contributions: Contribution[]
}

export type NotificationType =
  | 'OFFER_RECEIVED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'OFFER_WITHDRAWN'
  | 'DEAL_CONFIRMED'
  | 'DEAL_COMPLETED'
  | 'DEAL_CANCELLED'

export interface Notification {
  id: string
  recipientId: string
  entityType: 'offer' | 'deal'
  entityId: string
  type: NotificationType
  title: string
  body: string | null
  readAt: string | null
  createdAt: string
}

export interface ApiHealthResponse {
  ok: boolean
  status: string
  mode: 'live' | 'mock' | 'unavailable'
  message: string
}

export interface ApiError extends Error {
  status?: number
}
