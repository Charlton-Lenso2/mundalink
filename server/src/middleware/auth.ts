// Firebase authentication middleware.
//
// Reads the `Authorization: Bearer <id-token>` header, verifies the ID token with
// the Firebase Admin SDK, and attaches ONLY the verified Firebase UID to the
// request. No UID is ever trusted from the request body.
//
// This middleware does NOT require a role — pass `requireAdmin` to additionally
// enforce an admin role.

import type { Request, Response, NextFunction } from "express";
import { getFirebaseAdmin } from "../config/firebase";
import { unauthorizedError, forbiddenError } from "./error-handler";
import { prisma } from "../modules/prisma";

export interface AuthRequest extends Request {
  firebaseUid?: string;
  firebaseEmail?: string | null;
}

export interface AuthOptions {
  /** If true, additionally require the profile role to be "ADMIN". */
  requireAdmin?: boolean;
}

/**
 * Returns an Express middleware that verifies a Firebase ID token.
 *
 * The verified UID is attached to `req.firebaseUid`. Ownership and role checks
 * are the caller's responsibility via the `req.firebaseUid` value.
 */
export function authenticate(options: AuthOptions = {}): (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => Promise<void> {
  return async (req, _res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      unauthorizedError("Missing or malformed Authorization header");
      return;
    }

    const idToken = header.slice("Bearer ".length).trim();

    if (!idToken) {
      unauthorizedError("Empty bearer token");
      return;
    }

    let decoded: { uid: string; email?: string } | null = null;

    try {
      const { auth } = getFirebaseAdmin();
      decoded = await auth.verifyIdToken(idToken);
    } catch (err) {
      // Firebase rejects tokens that are expired, malformed, or not issued by it.
      const message =
        err instanceof Error ? `Token verification failed: ${err.message}` : "Token verification failed";
      unauthorizedError(message);
      return;
    }

    // The verified UID is the only identity proof we trust. Anything else
    // (body-supplied uid, session id, etc.) is ignored.
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email ?? null;

    // Attach the Prisma client once for the duration of this request.
    if (!req.prisma) {
      req.prisma = prisma;
    }

    if (options.requireAdmin) {
      const profile = await req.prisma.profile
        .findUnique({ where: { firebaseUid: req.firebaseUid }, select: { role: true } })
        .catch(() => null);
      if (!profile || profile.role !== "ADMIN") {
        forbiddenError("Admin role required");
        return;
      }
    }

    next();
  };
}
