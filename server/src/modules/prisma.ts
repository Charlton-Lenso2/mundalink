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

let globalPrisma: PrismaClient;

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
  if (globalPrisma) {
    return globalPrisma;
  }

  // `new PrismaClient({ datasources: { db: { url: databaseUrl } } })` pins the
  // pool to the pooled URL and avoids the DIRECT_URL being used as a fallback.
  globalPrisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  return globalPrisma;
}

export const prisma = createPrismaClient();

export function resetPrismaForTesting(): void {
  if (globalPrisma) {
    void globalPrisma.$disconnect();
    globalPrisma = undefined;
  }
  globalPrisma = createPrismaClient();
}

