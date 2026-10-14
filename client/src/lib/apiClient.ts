import { auth } from './firebase'
import { mockDeals, mockListings, mockOffers, mockProfile } from '../data/mock-data'
import type {
  AggregationView,
  ApiHealthResponse,
  Contribution,
  Deal,
  DealStatus,
  Listing,
  Notification,
  Offer,
  OfferStatus,
  Profile,
  Requirement,
} from '../types'

export function normalizeApiBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '').replace(/(?:\/api)+$/i, '')
}

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
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
  if (!user) throw new ApiError('Sign in is required for this action.', 401)
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

interface ApiEnvelope<T> {
  data: T
  meta?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

async function requestEnvelope<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = false,
): Promise<ApiEnvelope<T>> {
  const isMock = isMockForced || !apiBaseUrl
  if (isMock) {
    throw new ApiError('Live backend is not configured', 0)
  }

  const headers = new Headers(options.headers ?? {})
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

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
    meta?: ApiEnvelope<T>['meta']
  } | null

  if (!response.ok) {
    const errMsg =
      payload?.error && typeof payload.error === 'object' && payload.error.message
        ? String(payload.error.message)
        : payload?.message ?? (typeof payload?.error === 'string' ? payload.error : response.statusText)
    throw new ApiError(errMsg, response.status)
  }

  if (!payload || typeof payload !== 'object') {
    throw new ApiError('The backend returned an invalid JSON response.', response.status)
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return { data: payload.data as T, meta: payload.meta }
  }

  return { data: payload as T }
}

async function request<T>(path: string, options: RequestInit = {}, requireAuth = false): Promise<T> {
  const response = await requestEnvelope<T>(path, options, requireAuth)
  return response.data
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
      const { data: payload } = await requestEnvelope<{
        status: string
        database?: { status: string }
      }>('/health')
      const dbUp = payload.database?.status === 'up' && payload.status === 'ok'
      return {
        ok: dbUp,
        status: payload.status,
        mode: dbUp ? 'live' : 'unavailable',
        message: dbUp
          ? 'Live backend connected.'
          : 'The backend is reachable, but its database is unavailable.',
      }
    } catch (healthError) {
      const degraded = healthError instanceof ApiError && healthError.status === 503
      return {
        ok: false,
        status: degraded ? 'degraded' : 'unavailable',
        mode: 'unavailable',
        message: degraded
          ? 'The backend is reachable, but its database is unavailable.'
          : healthError instanceof Error
          ? `Live backend unavailable: ${healthError.message}`
          : 'Live backend unavailable. Check the connection and try again.',
      }
    }
  },

  listings: {
    list: async (query: ListingQuery = {}): Promise<ListingPage> => {
      if (isMockForced || !apiBaseUrl) {
        let items = [...mockListings]
        if (query.status) items = items.filter((listing) => listing.status === query.status)
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
        const total = items.length
        const limit = query.limit ?? (total || 1)
        const page = query.page ?? 1
        const start = (page - 1) * limit
        items = items.slice(start, start + limit)
        return { items, page, limit, total, totalPages: Math.ceil(total / limit) }
      }
      const params = new URLSearchParams()
      if (query.search) params.set('search', query.search)
      if (query.category) params.set('category', query.category)
      if (query.location) params.set('location', query.location)
      if (query.status) params.set('status', query.status)
      if (query.page) params.set('page', String(query.page))
      if (query.limit) params.set('limit', String(query.limit))
      const qs = params.toString()
      const response = await requestEnvelope<Listing[]>(`/listings${qs ? `?${qs}` : ''}`)
      if (!Array.isArray(response.data)) {
        throw new ApiError('The backend returned an invalid listings payload.', 502)
      }
      if (!response.meta) {
        throw new ApiError('The backend listings response is missing pagination metadata.', 502)
      }
      return {
        items: response.data,
        ...response.meta,
      }
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

  requirements: {
    listOpen: async (filters?: {
      commodity?: string
      category?: string
      location?: string
      unit?: string
      neededByFrom?: string
      page?: number
      limit?: number
    }): Promise<Paged<Requirement>> => {
      if (isMockForced || !apiBaseUrl) {
        return { items: [], page: filters?.page ?? 1, limit: filters?.limit ?? 20, total: 0, totalPages: 1 }
      }
      const params = new URLSearchParams()
      if (filters?.commodity) params.set('commodity', filters.commodity)
      if (filters?.category) params.set('category', filters.category)
      if (filters?.location) params.set('location', filters.location)
      if (filters?.unit) params.set('unit', filters.unit)
      if (filters?.neededByFrom) params.set('neededByFrom', filters.neededByFrom)
      if (filters?.page !== undefined) params.set('page', String(filters.page))
      if (filters?.limit !== undefined) params.set('limit', String(filters.limit))
      const query = params.toString()
      return paged<Requirement>(`/requirements${query ? `?${query}` : ''}`)
    },
    mine: async (page = 1, limit = 20): Promise<Paged<Requirement>> => {
      if (isMockForced || !apiBaseUrl) {
        return { items: [], page, limit, total: 0, totalPages: 1 }
      }
      return paged<Requirement>(`/requirements/mine?page=${page}&limit=${limit}`, {}, true)
    },
    get: async (id: string): Promise<Requirement> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Requirement>(`/requirements/${id}`, {}, true)
    },
    create: async (payload: {
      title: string
      quantity: string
      unit: string
      description?: string | null
      qualityNotes?: string | null
      category?: string | null
      commodity?: string | null
      location?: string | null
      neededBy?: string | null
      targetPrice?: string | null
      currency?: string
    }): Promise<Requirement> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Requirement>('/requirements', { method: 'POST', body: JSON.stringify(payload) }, true)
    },
    update: async (id: string, payload: Partial<{
      title: string
      description: string | null
      qualityNotes: string | null
      category: string | null
      commodity: string | null
      unit: string
      quantity: string
      targetPrice: string | null
      location: string | null
      neededBy: string | null
      currency: string
    }>): Promise<Requirement> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Requirement>(`/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, true)
    },
    cancel: async (id: string): Promise<Requirement> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Requirement>(`/requirements/${id}/cancel`, { method: 'POST' }, true)
    },
    aggregation: async (id: string): Promise<AggregationView> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<AggregationView>(`/requirements/${id}/aggregation`, {}, true)
    },
    propose: async (requirementId: string, payload: { listingId: string; quantity: string }): Promise<Contribution> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Contribution>(`/requirements/${requirementId}/contributions`, { method: 'POST', body: JSON.stringify(payload) }, true)
    },
  },

  contributions: {
    commit: async (id: string): Promise<Contribution> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Contribution>(`/contributions/${id}/commit`, { method: 'POST' }, true)
    },
    fulfil: async (id: string): Promise<Contribution> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Contribution>(`/contributions/${id}/fulfil`, { method: 'POST' }, true)
    },
    cancel: async (id: string): Promise<Contribution> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Contribution>(`/contributions/${id}/cancel`, { method: 'POST' }, true)
    },
  },

  notifications: {
    mine: async (limit = 50): Promise<{ items: Notification[]; unreadCount: number }> => {
      if (isMockForced || !apiBaseUrl) return { items: [], unreadCount: 0 }
      return request<{ items: Notification[]; unreadCount: number }>(`/notifications/mine?limit=${limit}`, {}, true)
    },
    markRead: async (id: string): Promise<Notification> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }, true)
    },
    markAllRead: async (): Promise<{ updated: number }> => {
      if (isMockForced || !apiBaseUrl) throw new ApiError('Live backend is not configured', 0)
      return request<{ updated: number }>('/notifications/read-all', { method: 'PATCH' }, true)
    },
  },
}

export const apiMode = isMockForced || !apiBaseUrl ? 'mock' : 'live'
export const apiNotice = isMockForced || !apiBaseUrl
  ? 'Demonstration data mode: the live backend is not connected in this environment.'
  : 'Live API mode is enabled.'
