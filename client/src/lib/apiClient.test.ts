// apiClient unit tests: URL building, HTTP error mapping (401/403/404/409/5xx),
// network failures, and response envelope validation. `fetch` is stubbed, so
// no backend or real network access is required.
//
// apiClient decides mock-vs-live mode at import time, so the environment is
// stubbed here, before the dynamic import below.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_API_BASE_URL', 'http://mundalink.test/api')
vi.stubEnv('VITE_USE_MOCK_API', 'false')

// Authenticated apiClient calls read the Firebase current user for a token.
// Stub a signed-in user so requireAuth paths send `Bearer test-token`.
vi.mock('./firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}))

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const fetchMock = vi.fn<FetchFn>()

let api: (typeof import('./apiClient'))['api']
let ApiError: (typeof import('./apiClient'))['ApiError']
let normalizeApiBaseUrl: (typeof import('./apiClient'))['normalizeApiBaseUrl']

beforeAll(async () => {
  const mod = await import('./apiClient')
  api = mod.api
  ApiError = mod.ApiError
  normalizeApiBaseUrl = mod.normalizeApiBaseUrl
})

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const jsonResponse = (status: number, body: unknown, statusText = 'Status') =>
  new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  })

describe('URL building', () => {
  it.each([
    ['http://mundalink.test', 'http://mundalink.test'],
    ['http://mundalink.test/api', 'http://mundalink.test'],
    ['http://mundalink.test/api/api/', 'http://mundalink.test'],
    ['  http://mundalink.test/api/  ', 'http://mundalink.test'],
    ['', ''],
    [undefined, ''],
  ])('normalizes API base URL %s', (baseUrl, expected) => {
    expect(normalizeApiBaseUrl(baseUrl)).toBe(expected)
  })

  it('calls the backend with exactly one /api prefix', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [],
        meta: { page: 1, limit: 9, total: 0, totalPages: 1 },
      }),
    )
    await api.listings.list({ page: 1, limit: 9 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toBe('http://mundalink.test/api/listings?page=1&limit=9')
    expect(url).not.toContain('/api/api/')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined()
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has('Content-Type')).toBe(false)
  })

  it('sends only supported listing filters and paging parameters', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [],
        meta: { page: 2, limit: 9, total: 10, totalPages: 2 },
      }),
    )
    await api.listings.list({
      search: 'white maize',
      category: 'Cereals',
      location: 'Mutoko',
      status: 'ACTIVE',
      page: 2,
      limit: 9,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://mundalink.test/api/listings?search=white+maize&category=Cereals&location=Mutoko&status=ACTIVE&page=2&limit=9',
    )
  })
})

describe('HTTP error mapping', () => {
  const cases = [
    [400, 'A related record is missing or invalid'],
    [401, 'Authentication required'],
    [403, 'You cannot act on this listing'],
    [404, 'The requested resource no longer exists'],
    [409, 'This offer has already been processed'],
  ] as const

  for (const [status, serverMessage] of cases) {
    it(`surfaces the server message for ${status} responses`, async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(status, { error: { code: 'TestError', message: serverMessage } }),
      )
      const failure = api.listings.list()
      await expect(failure).rejects.toBeInstanceOf(ApiError)
      await expect(failure).rejects.toMatchObject({ status, message: serverMessage })
    })
  }

  it('falls back to statusText when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 502, statusText: 'Bad Gateway' }))
    await expect(api.listings.list()).rejects.toMatchObject({
      status: 502,
      message: 'Bad Gateway',
    })
  })

  it('supports the legacy flat { message } error shape', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'quantity must be greater than zero' }))
    await expect(api.listings.list()).rejects.toMatchObject({
      status: 400,
      message: 'quantity must be greater than zero',
    })
  })
})

describe('network failures', () => {
  it('reports a friendly network error when fetch itself fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.listings.list()).rejects.toMatchObject({
      status: 0,
      message: 'Network error: could not reach the backend. Check your connection and try again.',
    })
  })
})

describe('response envelope validation', () => {
  it('returns items and pagination meta on success', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: 'lst_1' }],
        meta: { page: 1, limit: 9, total: 1, totalPages: 1 },
      }),
    )
    const page = await api.listings.list()
    expect(page.items).toHaveLength(1)
    expect(page.page).toBe(1)
    expect(page.limit).toBe(9)
    expect(page.total).toBe(1)
    expect(page.totalPages).toBe(1)
  })

  it('rejects a listings payload without pagination metadata', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }))
    await expect(api.listings.list()).rejects.toMatchObject({
      status: 502,
      message: 'The backend listings response is missing pagination metadata.',
    })
  })

  it('rejects a non-array listings payload', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { unexpected: true },
        meta: { page: 1, limit: 9, total: 0, totalPages: 1 },
      }),
    )
    await expect(api.listings.list()).rejects.toMatchObject({
      status: 502,
      message: 'The backend returned an invalid listings payload.',
    })
  })
})

describe('requirements endpoints', () => {
  it('fetches open requirements with filters on the public route', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [{ id: 'req_1' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
    )
    const page = await api.requirements.listOpen({ commodity: 'Maize', location: 'Lusaka', page: 1, limit: 20 })
    expect(page.items).toHaveLength(1)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/api/requirements?')
    expect(url).toContain('commodity=Maize')
    expect(url).toContain('location=Lusaka')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined()
  })

  it('creates a requirement with an authenticated POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 'req_9', title: 'Need maize' } }))
    const created = await api.requirements.create({ title: 'Need maize', quantity: '100', unit: 'kg' })
    expect(created).toMatchObject({ id: 'req_9' })
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toMatch(/^Bearer /)
  })

  it('proposes supply against a requirement with listing and quantity', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 'ctr_1', status: 'PROPOSED' } }))
    const contribution = await api.requirements.propose('req_1', { listingId: 'lst_a', quantity: '20' })
    expect(contribution).toMatchObject({ status: 'PROPOSED' })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/requirements/req_1/contributions')
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('lst_a')
  })
})

describe('notifications endpoints', () => {
  it('fetches my notifications with an unread count', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { items: [{ id: 'n1' }], unreadCount: 1 } }))
    const result = await api.notifications.mine(50)
    expect(result.unreadCount).toBe(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/notifications/mine?limit=50')
  })

  it('marks all notifications read with an authenticated PATCH', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { updated: 3 } }))
    const result = await api.notifications.markAllRead()
    expect(result.updated).toBe(3)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH')
  })
})