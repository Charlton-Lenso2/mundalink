# MundaLink Backend (`server/`)

Express + TypeScript API for MundaLink (Zimbabwe agricultural commerce).
PostgreSQL is hosted on Supabase; access is via Prisma ORM.
Auth is Firebase ID tokens verified server-side with Firebase Admin.

## Prerequisites

- Node.js 20+
- A Supabase project (connection strings from Project Settings → Database)
- A Firebase service-account JSON (Firebase console → Project settings → Service accounts)

## Setup

```powershell
cd server
npm install
Copy-Item .env.example .env   # then fill in real values (never commit .env)
# place the service-account JSON at the path in FIREBASE_SERVICE_ACCOUNT_PATH
# e.g. server/secrets/firebase-service-account.json (git-ignored)
npx prisma generate
```

Required env vars (see `.env.example`): `DATABASE_URL` (Supabase pooler, port
6543 + `?pgbouncer=true`), `DIRECT_URL` (Supabase direct, port 5432),
`FIREBASE_SERVICE_ACCOUNT_PATH`, plus `PORT` (default 5000) and `CLIENT_URL`
(frontend origin for CORS).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Hot-reload API (`tsx watch src/index.ts`) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` (auth boundaries, validation, inventory guard) |
| `npm run migrate:dev` | `prisma migrate dev` (local/dev workflow only) |
| `npm run migrate:deploy` | `prisma migrate deploy` (apply approved migrations) |
| `npm run prisma:generate` | Regenerate the Prisma client |

## Migrations (Supabase — non-destructive)

Never run `migrate reset`, `db push --force-reset`, or any drop command
against the shared Supabase project. The safe workflow is:

```powershell
npx prisma migrate status   # read-only: shows applied vs pending migrations
npx prisma migrate deploy   # applies pending migrations only
```

The initial migration has not been applied yet (see report): `prisma/migrations/`
does not exist in the repo. Before creating it, the live database tables must
be introspected (`prisma db pull` into a scratch schema) so the first migration
does not clash with existing tables.

## API contract

See [`docs/api-contract.md`](./docs/api-contract.md) — the single source of
truth for routes, request/response shapes, validation, auth errors, and the
all-or-nothing inventory rule. All routes are prefixed with `/api`.

## Admin bootstrap

There is no HTTP endpoint that grants the `ADMIN` role. The first
administrator (and any out-of-band promotion) is done by an operator:

```powershell
npm run admin:promote -- <firebaseUid-or-email>
```

Requires the normal server environment (`.env` + Firebase service-account
file). The target must have signed in once (profile row exists). Promotion is
idempotent and audit-logged (`ADMIN_PROMOTED`).
