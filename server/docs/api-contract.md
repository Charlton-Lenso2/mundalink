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
  If no row exists yet (PATCH before GET), one is created with the provided
  fields (role `OBSERVER` unless an admin supplied `role`).
  `role` is accepted ONLY from callers whose profile role is `ADMIN`;
  otherwise it is silently stripped (no self-promotion).

## Listings

Listing statuses: `DRAFT`, `ACTIVE`, `REJECTED`, `SOLD`. Status changes are
enforced server-side — 400 `Invalid status transition <from> -> <to>`:

| From | Allowed next statuses |
|---|---|
| `DRAFT` | `ACTIVE`, `REJECTED` |
| `ACTIVE` | `DRAFT`, `REJECTED`, `SOLD` |
| `REJECTED` | `DRAFT` (draft is reusable) |
| `SOLD` | — (terminal; a `SOLD` listing can never be resurrected) |

Setting a listing to its current status is an allowed no-op (idempotent
publish). Only the owner edits; only whitelisted fields.

- `GET /api/listings?search=&category=&location=&status=&sortBy=&sortOrder=&page=&limit=`
  → `{ data: Listing[], meta: { page, limit, total, totalPages } }`.
  `search` matches title/description/commodity (case-insensitive).
  `sortBy` is one of `createdAt` (default), `pricePerUnit`, `quantity`;
  `sortOrder` is `ASC` or `DESC` (default `DESC`). Anything else → 400.
- `GET /api/listings/:id` → `{ data: Listing }` or 404.
  Listing reads include `sellerName` when the seller has provided a display name.
- `POST /api/listings` (auth) — seller creates. Body:
  `{ title*, quantity*>0, pricePerUnit*>=0, availableQuantity*>=0,
     description?, category?, commodity?, unit?, currency?=USD(3-letter),
     location?, latitude?, longitude? }`.
  `sellerId` is forced to the caller's profile id. Creates with `DRAFT` and an
  `inventory` row in one transaction.
- `PATCH /api/listings/:id` (auth, owner only) — whitelisted fields;
  403 for non-owners, 404 for unknown ids. If availability changes, the
  inventory row and listing availability mirror are updated atomically; the
  request is rejected if available quantity would exceed total quantity or if
  inventory changed concurrently.

## Offers

Offer statuses: `PENDING`, `ACCEPTED`, `DECLINED`, `WITHDRAWN`, `EXPIRED`.
Only `PENDING` may transition; all others are terminal.

- `POST /api/offers` (auth) — body
  `{ listingId*, offeredQuantity*>0, offeredPrice*>=0, message? }`.
  `buyerId` is forced from the token. Rules: listing must be `ACTIVE`;
  buyer ≠ seller (403/400); one open (`PENDING`) offer per buyer per listing.
- `GET /api/offers/mine` (auth) — offers where I am buyer OR seller
  (via my listings), newest first. Each offer includes listing title, seller id
  and display name (when available), listing unit and currency, and buyer
  display name (when available), so the client can present actions by role.
- `PATCH /api/offers/:id/status` (auth) — body `{ status }`, one of:
  - `ACCEPTED` — listing owner only. Transactional: guarded inventory
    decrement + exactly-one deal (upsert on unique `offerId`) + offer→ACCEPTED.
    409 on insufficient stock or when the offer is no longer `PENDING`
    (repeat/double accept); safe under concurrent accepts and idempotent
    under retries.
  - `DECLINED` — listing owner only, from `PENDING` only.
  - `WITHDRAWN` — offer buyer only, from `PENDING` only.
  - `EXPIRED` — offer buyer only, from `PENDING` only.
  Anything else → 400; wrong actor → 403; unknown id → 404.

## Agreed deals

Deal statuses: `PENDING → CONFIRMED → COMPLETED`, or `→ CANCELLED` from
`PENDING`/`CONFIRMED`. `COMPLETED`/`CANCELLED` are terminal; never hard-deleted.

- `GET /api/deals/mine` (auth) — deals where my profile is buyer or seller.
  Each deal includes its listing title, unit, currency, and participant display
  names when available.
- `GET /api/deals/:id/history` (auth, buyer or seller of the deal) —
  audit-sourced status history, oldest first:
  `{ data: [{ id, action, actorId, payload, createdAt }] }`.
  Includes the deal's own `DEAL_*` transition entries plus the
  `OFFER_ACCEPTED` event that created it; `payload` is the parsed audit JSON
  or `null`. Outsider → 403; unknown id → 404.
- `PATCH /api/deals/:id/status` (auth, buyer or seller of the deal) — body
  `{ status, reason? }`, one of `CONFIRMED`, `COMPLETED`, `CANCELLED`.
  - `PENDING → CONFIRMED | CANCELLED`; `CONFIRMED → COMPLETED | CANCELLED`.
  - `COMPLETED` sets `executedAt`. Anything else → 400; outsider → 403;
    unknown id → 404. Audited as `DEAL_EXECUTED` / `DEAL_CANCELLED`.
  - `reason` (optional string, ≤ 500 chars) is recorded in the audit entry's
    `payload` and therefore appears in `/deals/:id/history` — use it to explain
    cancellations or note delivery issues. Invalid `reason` → 400.

## Analytics

- `GET /api/analytics/summary` (auth) → global platform aggregates computed
  from stored data (no fabricated numbers):
  ```json
  { "data": {
      "listings": { "byStatus": { "ACTIVE": 3, "DRAFT": 1 } },
      "offers":   { "byStatus": { "PENDING": 2 } },
      "deals":    { "byStatus": { "COMPLETED": 1 },
                    "agreedValueByCurrency": { "USD": "1105.000000" } },
      "profiles": { "total": 6, "byRole": { "SELLER": 3 } },
      "generatedAt": "2026-10-12T10:00:00.000Z"
  } }
  ```
  Deal value = Σ (agreedQuantity × agreedPrice), Decimal-safe, summed per
  listing currency. Only global aggregates are exposed — never per-user
  breakdowns.

## First-admin bootstrap

There is **no HTTP endpoint that grants `ADMIN`**. The first administrator is
provisioned by an operator running, from `server/`:

```powershell
npm run admin:promote -- <firebaseUid-or-email>
```

The target's profile must already exist (they must have signed in once). The
promotion is idempotent and recorded in the audit log (`ADMIN_PROMOTED`).
Existing admins can assign roles afterwards via `PATCH /api/profile/me`.

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
