import { auth } from './firebase'
import { mockDeals, mockListings, mockOffers, mockProfile } from '../data/mock-data'
import type { ApiHealthResponse, Deal, Listing, Offer, Profile } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const isMockForced = import.meta.env.VITE_USE_MOCK_API === 'true'

const buildUrl = (path: string) => {
  if (!apiBaseUrl && !isMockForced) {
    return path
  }
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

const getAuthHeader = async () => {
  const user = auth.currentUser
  if (!user) {
    return {}
  }
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function request<T>(path: string, options: RequestInit = {}, requireAuth = false): Promise<T> {
  const isMock = isMockForced || !apiBaseUrl
  if (isMock) {
    throw new Error('MOCK_MODE')
  }

  const headers = new Headers(options.headers ?? {})
  headers.set('Content-Type', 'application/json')

  if (requireAuth) {
    const authHeaders = await getAuthHeader()
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value)
    })
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  })

  const payload = await parseJson<T>(response)
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as Record<string, unknown>).message)
      : 'Request failed'
    throw new Error(message)
  }

  return (payload ?? ({} as T))
}

export const api = {
  health: async (): Promise<ApiHealthResponse> => {
    if (isMockForced || !apiBaseUrl) {
      return {
        ok: true,
        status: 'demo',
        mode: 'mock',
        message: 'Demo data mode enabled because the live backend is unavailable.',
      }
    }

    try {
      const response = await request<{ ok: boolean; status: string; message?: string }>('/health')
      return {
        ok: response.ok,
        status: response.status,
        mode: 'live',
        message: response.message ?? 'Live backend connected.',
      }
    } catch {
      return {
        ok: true,
        status: 'demo',
        mode: 'mock',
        message: 'Demo data mode enabled because the live backend is unavailable.',
      }
    }
  },

  listings: {
    list: async () => {
      if (isMockForced || !apiBaseUrl) {
        return mockListings
      }
      try {
        const response = await request<Listing[]>('/listings')
        return response
      } catch {
        return mockListings
      }
    },
    getById: async (id: string) => {
      if (isMockForced || !apiBaseUrl) {
        return mockListings.find((listing) => listing.id === id) ?? null
      }
      try {
        const response = await request<Listing>(`/listings/${id}`)
        return response
      } catch {
        return mockListings.find((listing) => listing.id === id) ?? null
      }
    },
    create: async (payload: Omit<Listing, 'id' | 'sellerId' | 'sellerName' | 'status' | 'createdAt'>) => {
      if (isMockForced || !apiBaseUrl) {
        const newListing: Listing = {
          ...payload,
          id: `listing-${Date.now()}`,
          sellerId: 'current-user',
          sellerName: mockProfile.name,
          status: 'Available',
          createdAt: new Date().toISOString(),
        }
        mockListings.unshift(newListing)
        return newListing
      }
      try {
        const response = await request<Listing>('/listings', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, true)
        return response
      } catch {
        const newListing: Listing = {
          ...payload,
          id: `listing-${Date.now()}`,
          sellerId: 'current-user',
          sellerName: mockProfile.name,
          status: 'Available',
          createdAt: new Date().toISOString(),
        }
        mockListings.unshift(newListing)
        return newListing
      }
    },
  },

  profile: {
    me: async (): Promise<Profile> => {
      if (isMockForced || !apiBaseUrl) {
        return mockProfile
      }
      try {
        const response = await request<Profile>('/profile/me', {}, true)
        return response
      } catch {
        return mockProfile
      }
    },
    update: async (payload: Partial<Profile>) => {
      if (isMockForced || !apiBaseUrl) {
        Object.assign(mockProfile, payload)
        return mockProfile
      }
      try {
        const response = await request<Profile>('/profile/me', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }, true)
        return response
      } catch {
        Object.assign(mockProfile, payload)
        return mockProfile
      }
    },
  },

  offers: {
    mine: async (): Promise<Offer[]> => {
      if (isMockForced || !apiBaseUrl) {
        return mockOffers
      }
      try {
        const response = await request<Offer[]>('/offers/mine', {}, true)
        return response
      } catch {
        return mockOffers
      }
    },
    create: async (payload: Omit<Offer, 'id' | 'buyerId' | 'buyerName' | 'status' | 'createdAt'>) => {
      if (isMockForced || !apiBaseUrl) {
        const newOffer: Offer = {
          ...payload,
          id: `offer-${Date.now()}`,
          buyerId: 'current-user',
          buyerName: mockProfile.name,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        }
        mockOffers.unshift(newOffer)
        return newOffer
      }
      try {
        const response = await request<Offer>('/offers', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, true)
        return response
      } catch {
        const newOffer: Offer = {
          ...payload,
          id: `offer-${Date.now()}`,
          buyerId: 'current-user',
          buyerName: mockProfile.name,
          status: 'Pending',
          createdAt: new Date().toISOString(),
        }
        mockOffers.unshift(newOffer)
        return newOffer
      }
    },
    updateStatus: async (offerId: string, status: Offer['status']) => {
      if (isMockForced || !apiBaseUrl) {
        const target = mockOffers.find((offer) => offer.id === offerId)
        if (target) {
          target.status = status
        }
        return target ?? null
      }
      try {
        const response = await request<Offer>(`/offers/${offerId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }, true)
        return response
      } catch {
        const target = mockOffers.find((offer) => offer.id === offerId)
        if (target) {
          target.status = status
        }
        return target ?? null
      }
    },
  },

  deals: {
    mine: async (): Promise<Deal[]> => {
      if (isMockForced || !apiBaseUrl) {
        return mockDeals
      }
      try {
        const response = await request<Deal[]>('/deals/mine', {}, true)
        return response
      } catch {
        return mockDeals
      }
    },
  },
}

export const apiMode = isMockForced || !apiBaseUrl ? 'mock' : 'live'
export const apiNotice = isMockForced || !apiBaseUrl
  ? 'Demo data mode: the live backend is not connected in this environment.'
  : 'Live API mode is enabled.'

export const resolveListingStatus = (status: Listing['status']) => {
  if (status === 'Reserved') return 'Reserved'
  if (status === 'Sold') return 'Sold'
  return 'Available'
}
