# MundaLink API Contract (backend ↔ frontend)

Base URL: `<API_ORIGIN>/api` (e.g. `http://localhost:5000/api`).
All JSON uses `{ "data": … }` for success and
`{ "error": { "code", "message", "details?" }, "timestamp", "requestId?" }` for errors.
Money/quantities are decimal strings (never floats). Timestamps are ISO-8601.

## Auth

Every protected route requires `Authorization: Bearer <Firebase ID token>`.
The backend verifies the token with Firebase Admin and uses ONLY the verified
`firebaseUid`. A `uid`/`buyerId`/`sellerId` in the body is ignored or rejected.

| Situation | Status |
|---|---|
| Missing/malformed header, bad/expired token | 401 |
| Valid token, wrong owner / wrong role | 403 |
| Unknown resource | 404 |
| Bad body/query | 400/422 |
| State conflict (double transition, insufficient stock) | 409 |

## Health

`GET /api/health` → `{ status, uptime, timestamp, database: { status } }`.
DB is checked separately (`SELECT 1`); 503 + `degraded` when DB is down.

## Profile

- `GET /api/profile/me` (auth) — get or create my `profiles` row keyed by
  verified `firebaseUid`. Creates with role `OBSERVER` when absent.
- `PATCH /api/profile/me` (auth) — body may include `displayName`, `phone`,
  `avatarUrl`, `city`, `region`, `country`, `latitude`, `longitude`.
  `role` is accepted ONLY from callers whose profile role is `ADMIN`;
  otherwise it is silently stripped (no self-promotion).

## Listings

Listing statuses: `DRAFT → ACTIVE → SOLD`, plus `REJECTED`.
`SOLD`/`REJECTED` are terminal-ish: edits that would resurrect a `SOLD`
listing are rejected; only the owner edits; only whitelisted fields.

- `GET /api/listings?search=&category=&location=&status=&page=&limit=`
  → `{ data: Listing[], meta: { page, limit, total, totalPages } }`.
  `search` matches title/description/commodity (case-insensitive).
- `GET /api/listings/:id` → `{ data: Listing }` or 404.
- `POST /api/listings` (auth) — seller creates. Body:
  `{ title*, quantity*>0, pricePerUnit*>=0, availableQuantity*>=0,
     description?, category?, commodity?, unit?, currency?=USD(3-letter),
     location?, latitude?, longitude? }`.
  `sellerId` is forced to the caller's profile id. Creates with `DRAFT` and an
  `inventory` row in one transaction.
- `PATCH /api/listings/:id` (auth, owner only) — whitelisted fields;
  403 for non-owners, 404 for unknown ids.

## Offers

Offer statuses: `PENDING`, `ACCEPTED`, `DECLINED`, `WITHDRAWN`, `EXPIRED`.
Only `PENDING` may transition; all others are terminal.

- `POST /api/offers` (auth) — body
  `{ listingId*, offeredQuantity*>0, offeredPrice*>=0, message? }`.
  `buyerId` is forced from the token. Rules: listing must be `ACTIVE`;
  buyer ≠ seller (403/400); one open (`PENDING`) offer per buyer per listing.
- `GET /api/offers/mine` (auth) — offers where I am buyer OR seller
  (via my listings), newest first.
- `PATCH /api/offers/:id/status` (auth) — body `{ status }`, one of:
  - `ACCEPTED` — listing owner only. Transactional: guarded inventory
    decrement + exactly-one deal (upsert on unique `offerId`) + offer→ACCEPTED.
    409 on insufficient stock or repeat; safe under concurrent accepts and
    idempotent under retries.
  - `DECLINED` — listing owner only, from `PENDING` only.
  - `WITHDRAWN` — offer buyer only, from `PENDING` only.
  - `EXPIRED` — offer buyer only, from `PENDING` only.
  Anything else → 400; wrong actor → 403; unknown id → 404.

## Agreed deals

Deal statuses: `PENDING → CONFIRMED → COMPLETED`, or `→ CANCELLED` from
`PENDING`/`CONFIRMED`. `COMPLETED`/`CANCELLED` are terminal; never hard-deleted.

- `GET /api/deals/mine` (auth) — deals where my profile is buyer or seller.

## Inventory behavior (all-or-nothing)

Every listing has exactly one `inventory` row (`availableQuantity` decimal).
Accepting an offer runs in one DB transaction:

1. Re-read offer + listing inside the transaction.
2. Validate `PENDING` offer, `ACTIVE` listing, caller = listing owner.
3. Guarded decrement:
   `UPDATE inventory SET available = available - qty
     WHERE listingId = ? AND available >= qty`, then check affected rows = 1.
   Otherwise the transaction rolls back with 409 (insufficient inventory).
4. `upsert` the deal on unique `offerId` (exactly one deal ever; retries safe).
5. Offer → `ACCEPTED`. Audit entries written.

There is NO partial fulfilment: the full offered quantity must be available or
the accept is rejected. Concurrent accepts serialize on the guarded predicate —
the loser sees affected-rows = 0 and gets 409. No client price, user id, deal
id, or ownership claim is ever trusted.
