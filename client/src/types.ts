export type CommodityCategory =
  | 'Cereals'
  | 'Legumes'
  | 'Vegetables'
  | 'Fruits'
  | 'Livestock'
  | 'Inputs'

export type ListingStatus = 'Available' | 'Reserved' | 'Sold'
export type OfferStatus = 'Pending' | 'Accepted' | 'Declined' | 'Withdrawn' | 'Expired'
export type DealStatus = 'Pending' | 'In transit' | 'Completed' | 'Disputed'

export interface Listing {
  id: string
  title: string
  description: string
  commodity: string
  category: CommodityCategory
  quantity: number
  unit: string
  price: number
  currency: string
  location: string
  sellerId: string
  sellerName: string
  status: ListingStatus
  createdAt: string
}

export interface Offer {
  id: string
  listingId: string
  buyerId: string
  buyerName: string
  quantity: number
  price: number
  currency: string
  message?: string
  status: OfferStatus
  createdAt: string
  expiresAt?: string
}

export interface Deal {
  id: string
  listingId: string
  buyerId: string
  sellerId: string
  buyerName: string
  sellerName: string
  commodity: string
  quantity: number
  totalPrice: number
  currency: string
  status: DealStatus
  location: string
}

export interface Profile {
  id: string
  name: string
  email: string
  phone: string
  location: string
  farmName: string
  role: 'Farmer' | 'Buyer' | 'Aggregator'
  bio: string
}

export interface ApiHealthResponse {
  ok: boolean
  status: string
  mode: 'live' | 'mock'
  message: string
}

export interface ApiError extends Error {
  status?: number
}
