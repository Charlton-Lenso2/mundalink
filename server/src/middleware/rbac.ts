// Role-based access control (RBAC) middleware + helpers.
//
// Authentication (WHO you are) is handled by `authenticate()`; RBAC decides what
// your ROLE permits. Roles are read SERVER-SIDE from the `profiles` table — a
// client-supplied role is NEVER trusted. Record-ownership checks remain in the
// services/routes; RBAC is an ADDITIONAL layer, not a replacement, so existing
// transaction invariants (ownership, exactly-one-deal, inventory concurrency)
// are preserved.
//
// Role capabilities (see docs/api-contract.md "Roles & authorization"):
//   OBSERVER - public reads + own profile only; NO trading.
//   BUYER    - submit/manage own offers and purchase workflows.
//   SELLER   - manage own listings; act on offers for those listings.
//   ADMIN    - administration only (role assignment); NO special trading power.

import type { Request, RequestHandler } from "express";
import { forbiddenError } from "./error-handler";
import { prisma } from "../modules/prisma";
import type { ProfileRole } from "../modules/types/profile";

/** The two trading roles. (Exported for documentation/tests.) */
export const TRADING_ROLES: ProfileRole[] = ["BUYER", "SELLER"];

/**
 * Resolve the caller's role from the database (the single source of truth).
 * A caller with no profile row is treated as OBSERVER (not yet onboarded).
 */
export async function resolveRole(firebaseUid: string, client = prisma): Promise<ProfileRole> {
  const profile = await client.profile.findUnique({
    where: { firebaseUid },
    select: { role: true },
  });
  return (profile?.role ?? "OBSERVER") as ProfileRole;
}

/**
 * Synchronous guard for handlers that have already resolved the role (e.g. the
 * offer-status handler, where the required role depends on the target status).
 * Throws a 403 with a clear message when the role is not permitted.
 */
export function assertRole(role: ProfileRole, ...allowed: ProfileRole[]): void {
  if (!allowed.includes(role)) {
    forbiddenError(`This action requires ${allowed.join(" or ")} role (your role: ${role}).`);
  }
}

/**
 * Express middleware: allow the request only if the caller's DB role is in
 * `allowed`. MUST run after `authenticate()`. A caller with no profile row is
 * treated as OBSERVER and is therefore denied any trading/admin role.
 */
export function requireRole(...allowed: ProfileRole[]): RequestHandler {
  return async (req: Request, _res, next) => {
    const uid = req.firebaseUid;
    // Defensive: authenticate() sets firebaseUid and 401s otherwise. If it is
    // somehow absent, defer to downstream handling rather than crash.
    if (!uid) {
      next();
      return;
    }
    const role = await resolveRole(uid, req.prisma ?? prisma);
    if (!allowed.includes(role)) {
      forbiddenError(`This action requires ${allowed.join(" or ")} role (your role: ${role}).`);
      return;
    }
    next();
  };
}
