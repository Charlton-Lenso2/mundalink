// Type declarations for Node + Express + Prisma in this project.
// Augments Express request types so middleware can attach `firebaseUid`,
// `prisma`, and `requestId` without circular imports.

import type { PrismaClient } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      firebaseUid?: string;
      firebaseEmail?: string | null;
      prisma?: PrismaClient;
      requestId?: string;
    }
  }
}

export {};
