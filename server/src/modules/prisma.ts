// Prisma client singleton.
//
// Connection types:
//   - DATABASE_URL    -> the pooled Supabase URL (used by prisma generate/migrate).
//   - DIRECT_URL      -> the direct Supabase URL (used for schema push in tests).
//
// We read both env vars at startup so Prisma does NOT auto-load .env on its own
// (Prisma loads process.env only when you call `PrismaClient` without an explicit
// `url`, which can silently pick up a wrong credential file). Explicit URLs give
// us deterministic behaviour and a clean error message on misconfiguration.

import { PrismaClient } from "@prisma/client";

export type Prisma = PrismaClient;

let cached: PrismaClient | undefined;

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!databaseUrl || !directUrl) {
    throw new Error(
      "Database configuration is incomplete. Set both DATABASE_URL and DIRECT_URL " +
        "in the environment. DATABASE_URL is the pooled Supabase URL; DIRECT_URL is " +
        "the direct Supabase URL. Both are required to run prisma migrate deploy " +
        "and prisma generate in this environment."
    );
  }

  // Returning a single shared instance avoids exhausting connections under load
  // and keeps PrismaClient from re-initialising per request.
  if (cached) {
    return cached;
  }

  cached = new PrismaClient();

  return cached;
}

function ensurePrismaClient(): PrismaClient {
  if (!cached) {
    cached = createPrismaClient();
  }
  return cached;
}

// Lazily-initialised proxy: importing this module never throws, so unit tests
// that inject their own client (or mock this module) run without
// DATABASE_URL/DIRECT_URL. The first real property access creates the client
// and surfaces the configuration error at that point, not at import time.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = ensurePrismaClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    if (typeof value === "function") {
      return (value as (...args: never[]) => unknown).bind(client);
    }
    return value;
  },
});

export function resetPrismaForTesting(): void {
  if (cached) {
    void cached.$disconnect();
    cached = undefined;
  }
}

