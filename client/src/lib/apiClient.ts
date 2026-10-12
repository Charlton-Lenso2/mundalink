import { auth } from './firebase'
import { mockDeals, mockListings, mockOffers, mockProfile } from '../data/mock-data'
import type { ApiHealthResponse, Deal, DealStatus, Listing, Offer, OfferStatus, Profile } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const isMockForced = import.meta.env.VITE_USE_MOCK_API === 'true'

const buildUrl = (path: string) => {
  const suffixed = path.startsWith('/') ? path : `/${path}`
  // Backend mounts every route under /api (see server/src/app.ts).
  const withPrefix = suffixed.startsWith('/api/') ? suffixed : `/api${suffixed}`
  if (!apiBaseUrl) return withPrefix
  return `${apiBaseUrl}${withPrefix}`
}

const getAuthHeader = async () => {
  const user = auth.currentUser
  if (!user) return {}
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

async function parseJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}, requireAuth = false): Promise<T> {
  const isMock = isMockForced || !apiBaseUrl
  if (isMock) {
    throw new ApiError('Live backend is not configured', 0)
  }

  const headers = new Headers(options.headers ?? {})
  headers.set('Content-Type', 'application/json')

  if (requireAuth) {
    const authHeaders = await getAuthHeader()
    Object.entries(authHeaders).forEach(([key, value]) => headers.set(key, String(value)))
  }

  const response = await fetch(buildUrl(path), { ...options, headers }).catch(() => {
    throw new ApiError('Network error: could not reach the backend. Check your connection and try again.', 0)
  })
  const payload = (await parseJson(response)) as {
    ok?: boolean
    status?: string
    message?: string
    error?: { message?: unknown } | string
    data?: T
  } | null

  if (!response.ok) {
    const errMsg =
      payload?.error && typeof payload.error === 'object' && payload.error.message
        ? String(payload.error.message)
        : payload?.message ?? (typeof payload?.error === 'string' ? payload.error : response.statusText)
    throw new ApiError(errMsg, response.status)
  }

  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data as T
  }

  return (payload ?? ({} as T)) as T
}

export interface ListingQuery {
  search?: string
  category?: string
  location?: string
  status?: Listing['status']
  page?: number
  limit?: number
}

export interface ListingPage {
  items: Listing[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export const api = {
  health: async (): Promise<ApiHealthResponse> => {
    if (isMockForced || !apiBaseUrl) {
      return {
        ok: true,
        status: 'demo',
        mode: 'mock',
        message: 'Demonstration data mode: the live backend is not connected in this environment.',
      }
    }

    try {
      const payload = await request<{ status: string; database?: { status: string } }>('/health')
      const dbUp = payload.database?.status === 'up' || payload.status === 'ok'
      return {
        ok: dbUp,
        status: payload.status,
        mode: 'live',
        message: dbUp ? 'Live backend connected.' : 'Live backend reachable; database is degraded.',
      }
    } catch {
      return {
        ok: true,
        status: 'demo',
        mode: 'mock',
        message: 'Demonstration data mode: the live backend is unavailable.',
      }
    }
  },

  listings: {
    list: async (query: ListingQuery = {}): Promise<ListingPage> => {
      if (isMockForced || !apiBaseUrl) {
        let items = [...mockListings]
        const search = (query.search ?? '').toLowerCase()
        if (search) {
          items = items.filter((l) =>
            [l.title, l.description ?? '', l.commodity ?? ''].join(' ').toLowerCase().includes(search),
          )
        }
        if (query.category && query.category !== 'All') items = items.filter((l) => l.category === query.category)
        if (query.location && query.location !== 'All') {
          items = items.filter((l) => (l.location ?? '').toLowerCase().includes((query.location ?? '').toLowerCase()))
        }
        return { items, page: 1, limit: items.length, total: items.length, totalPages: 1 }
      }
      const params = new URLSearchParams()
      if (query.search) params.set('search', query.search)
      if (query.category) params.set('category', query.category)
      if (query.location) params.set('location', query.location)
      if (query.status) params.set('status', query.status)
      if (query.page) params.set('page', String(query.page))
      if (query.limit) params.set('limit', String(query.limit))
      const qs = params.toString()
      const response = await request<Listing[] | { data: Listing[]; meta: Omit<ListingPage, 'items'> }>(`/listings${qs ? `?${qs}` : ''}`)
      if (Array.isArray(response)) {
        return { items: response, page: 1, limit: response.length, total: response.length, totalPages: 1 }
      }
      return { items: response.data ?? [], ...(response.meta ?? { page: 1, limit: 0, total: 0, totalPages: 0 }) }
    },
    getById: async (id: string) => {
      if (isMockForced || !apiBaseUrl) return mockListings.find((l) => l.id === id) ?? null
      try {
        const response = await request<Listing>(`/listings/${id}`)
        return response
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
    create: async (payload: {
      title: string
      description?: string | null
      commodity?: string | null
      category?: string | null
      quantity: string
      unit?: string | null
      pricePerUnit: string
      availableQuantity: string
      currency?: string
      location?: string | null
    }) => {
      if (isMockForced || !apiBaseUrl) {
        const newListing: Listing = {
          ...payload,
          id: `listing-${Date.now()}`,
          description: payload.description ?? null,
          commodity: payload.commodity ?? null,
          category: payload.category ?? null,
          unit: payload.unit ?? null,
          location: payload.location ?? null,
          currency: payload.currency ?? 'USD',
          sellerId: 'current-user',
          sellerName: mockProfile.displayName ?? 'Demonstration seller',
          status: 'DRAFT',
          createdAt: new Date().toISOString(),
        }
        mockListings.unshift(newListing)
        return newListing
      }
      return request<Listing>('/listings', { method: 'POST', body: JSON.stringify(payload) }, true)
    },
    publish: async (id: string) => {
      if (isMockForced || !apiBaseUrl) {
        const target = mockListings.find((l) => l.id === id)
        if (target) target.status = 'ACTIVE'
        return target ?? null
      }
      return request<Listing>(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }, true)
    },
  },

  profile: {
    me: async (): Promise<Profile> => {
      if (isMockForced || !apiBaseUrl) return mockProfile
      return request<Profile>('/profile/me', {}, true)
    },
    update: async (payload: Partial<Profile>) => {
      if (isMockForced || !apiBaseUrl) {
        Object.assign(mockProfile, payload)
        return mockProfile
      }
      return request<Profile>('/profile/me', { method: 'PATCH', body: JSON.stringify(payload) }, true)
    },
  },

  offers: {
    mine: async (): Promise<Offer[]> => {
      if (isMockForced || !apiBaseUrl) return mockOffers
      return request<Offer[]>('/offers/mine', {}, true)
    },
    create: async (payload: { listingId: string; offeredQuantity: string; offeredPrice: string; message?: string | null }) => {
      if (isMockForced || !apiBaseUrl) {
        const newOffer: Offer = {
          ...payload,
          message: payload.message ?? null,
          id: `offer-${Date.now()}`,
          buyerId: 'current-user',
          buyerName: mockProfile.displayName ?? 'Demonstration buyer',
          currency: 'USD',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        }
        mockOffers.unshift(newOffer)
        return newOffer
      }
      return request<Offer>('/offers', { method: 'POST', body: JSON.stringify(payload) }, true)
    },
    updateStatus: async (offerId: string, status: OfferStatus) => {
      if (isMockForced || !apiBaseUrl) {
        const target = mockOffers.find((o) => o.id === offerId)
        if (target) target.status = status
        return target ?? null
      }
      return request<Offer>(`/offers/${offerId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, true)
    },
  },

  deals: {
    mine: async (): Promise<Deal[]> => {
      if (isMockForced || !apiBaseUrl) return mockDeals
      return request<Deal[]>('/deals/mine', {}, true)
    },
    updateStatus: async (dealId: string, status: DealStatus) => {
      if (isMockForced || !apiBaseUrl) {
        const target = mockDeals.find((d) => d.id === dealId)
        if (target) target.status = status
        return target ?? null
      }
      return request<Deal>(`/deals/${dealId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, true)
    },
  },
}

export const apiMode = isMockForced || !apiBaseUrl ? 'mock' : 'live'
export const apiNotice = isMockForced || !apiBaseUrl
  ? 'Demonstration data mode: the live backend is not connected in this environment.'
  : 'Live API mode is enabled.'
