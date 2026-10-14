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
`A related record is missing or invalid` is a **400** produced only by a
**write** (create/update) whose foreign-key reference is missing at write time
(Prisma `P2003`). It is **never** returned by `GET /api/listings` (or any read) —
a read cannot violate a foreign key. Reads reject bad input with a different
`ValidationError` 400 (e.g. `sortBy must be one of createdAt, pricePerUnit,
quantity`). Writes validate their references before touching the DB, so a
`P2003` indicates a genuinely missing parent row (e.g. an offer for a listing
that no longer exists), not a malformed query.

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

## Notifications

Notifications are derived from REAL domain events only — there is no create
endpoint and clients cannot fabricate them. The offer/deal routes write a
notification (best-effort) right after the matching audit-log entry, so the two
never disagree about what happened. Recipient identity is always resolved
server-side (the listing seller, the offer buyer, or the other deal
participant) — never from the request body.

Event → notification mapping:

| Real event | Recipient | `type` |
|---|---|---|
| Offer created on a listing | listing seller | `OFFER_RECEIVED` |
| Offer accepted | offer buyer | `OFFER_ACCEPTED` |
| Offer declined | offer buyer | `OFFER_DECLINED` |
| Offer withdrawn / expired | listing seller | `OFFER_WITHDRAWN` |
| Deal `CONFIRMED` / `COMPLETED` / `CANCELLED` | the other deal participant | `DEAL_CONFIRMED` / `DEAL_COMPLETED` / `DEAL_CANCELLED` |

- `GET /api/notifications/mine?limit=` (auth) → newest first for the caller,
  with an unread count. `limit` is clamped to 1..100 (default 50).
  ```json
  { "data": {
      "items": [ { "id", "recipientId", "entityType", "entityId", "type",
                   "title", "body", "readAt", "createdAt" } ],
      "unreadCount": 2 } }
  ```
  `entityType` is `offer` or `deal`; `entityId` links back to that entity so the
  client can deep-link. Each item's `title`/`body` describe the real event.
- `PATCH /api/notifications/:id/read` (auth, owner only) → mark one read
  (idempotent; the original `readAt` is preserved). Outsider → 403; unknown
  id → 404. Returns the updated notification.
- `PATCH /api/notifications/read-all` (auth) → mark all of the caller's unread
  notifications read. Returns `{ "data": { "updated": <count> } }`.

Notifications are never hard-deleted; marking read is the only mutation. A
notification write failure is swallowed so it can never break the offer/deal
action that triggered it (the audit log remains the system of record).


## Roles & authorization

Roles are `OBSERVER` (default for every new profile), `SELLER`, `BUYER`, and
`ADMIN`. Trading authorization is now **role-enforced** server-side, in addition
to authentication and record-ownership checks. The acting role is read from the
`profiles` table on every gated request; a client-supplied role is never trusted.
Authorization is layered: `authenticate()` proves identity, `requireRole` proves
the role permits the action, and ownership checks (in services/routes) prove the
caller owns the record.

| Role | Permitted |
|---|---|
| `OBSERVER` | Public reads (`GET /api/listings[/:id]`), health, own profile (`GET`/`PATCH /api/profile/me`). **No trading.** |
| `BUYER` | OBSERVER capabilities + submit offers, manage own offers (`WITHDRAWN`/`EXPIRED`) and own deals. |
| `SELLER` | OBSERVER capabilities + create/manage own listings, act on offers for those listings (`ACCEPTED`/`DECLINED`). |
| `ADMIN` | Administration only (assign roles). **No special trading power**; admin access never bypasses transaction invariants. |

Endpoint role requirements (mutating/trading):

| Endpoint | Required role | Extra check |
|---|---|---|
| `POST /api/listings` | `SELLER` | owner = verified UID |
| `PATCH /api/listings/:id` | `SELLER` | owner only (else 403) |
| `POST /api/offers` | `BUYER` | listing `ACTIVE`, not own listing |
| `PATCH /api/offers/:id/status` -> `ACCEPTED`/`DECLINED` | `SELLER` | listing owner only |
| `PATCH /api/offers/:id/status` -> `WITHDRAWN`/`EXPIRED` | `BUYER` | offer buyer only |
| `PATCH /api/deals/:id/status` | participant | buyer-or-seller of the deal + status state machine |

Reads of a user own records (`/api/offers/mine`, `/api/deals/mine`,
`/api/deals/:id/history`, `/api/notifications/*`) require authentication only and
are scoped to the caller. Deal fulfilment transitions stay gated by
participant-ownership and the status machine (not by role), so an `OBSERVER` can
never enter a deal and all existing valid transitions are preserved.

Role assignment (restricted; no self-service):
- `PATCH /api/profile/me` accepts `role` **only** when the caller is already an
  `ADMIN`; for everyone else `role` is stripped, so self-promotion is impossible.
- The **first** `ADMIN` is provisioned out-of-band by an operator
  (`npm run admin:promote`, see below).
- An authorised **operator** assigns `BUYER`/`SELLER` (or `ADMIN`) to an existing
  user with `npm run role:assign -- <firebaseUid-or-email> <ROLE>`. The target
  must have signed in once (profile row exists). Every change is audit-logged
  (`ROLE_ASSIGNED`). This is server-side only; there is no HTTP endpoint that
  grants a role.

Onboarding a new user: a new sign-in defaults to `OBSERVER` and can browse but
not trade. An operator runs `role:assign` to grant `BUYER` and/or `SELLER` once
the user is verified.

Single-role model: a profile holds exactly one `role`. A user who both buys and
sells is switched between `BUYER` and `SELLER` by an operator (smallest safe
approach; no schema change). If simultaneous dual capability is required later,
migrate `Profile.role String` to `roles String[]` (or a `ProfileRole` join
table) via a reviewed, backward-compatible migration rather than allowing a
second role today.

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
