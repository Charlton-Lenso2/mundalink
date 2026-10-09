// Type declarations for Node + Express + Prisma in this project.
// Augments global types so other modules can access `req.firebaseUid` and
// `req.prisma` without circular imports.

import type { Request } from "express";
import type { PrismaClient } from "@prisma/client";

declare global {
  // Request extension attached by the Firebase auth middleware.
  interface Request {
    firebaseUid?: string;
    prisma?: PrismaClient;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    firebaseUid?: string;
    prisma?: PrismaClient;
  }
}
