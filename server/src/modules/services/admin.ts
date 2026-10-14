// Admin bootstrap service: secure first-administrator provisioning.
//
// There is deliberately NO HTTP endpoint that grants the ADMIN role. The only
// sanctioned paths to ADMIN are:
//   1. an existing ADMIN assigning the role via PATCH /api/profile/me, or
//   2. an operator running `npm run admin:promote -- <firebaseUid|email>`
//      (scripts/promote-admin.ts, which calls this service).
//
// Every promotion is recorded in the audit log. The target user must already
// have signed in once (profile row exists), so we never fabricate identities.

import type { PrismaClient } from "@prisma/client";
import { auditLog } from "../auditLog";
import { badRequestError, notFoundError } from "../../middleware/error-handler";

/** Minimal slice of the Firebase Admin Auth SDK (injectable for tests). */
export interface FirebaseAuthLike {
  getUser(uid: string): Promise<{ uid: string }>;
  getUserByEmail(email: string): Promise<{ uid: string }>;
}

export interface PromoteAdminResult {
  firebaseUid: string;
  profileId: string;
  previousRole: string;
  role: string;
  alreadyAdmin: boolean;
}

/** Roles an operator may assign via the `role:assign` CLI. */
export type AssignableRole = "BUYER" | "SELLER" | "ADMIN" | "OBSERVER";
const ASSIGNABLE_ROLES: AssignableRole[] = ["BUYER", "SELLER", "ADMIN", "OBSERVER"];

export interface AssignRoleResult {
  firebaseUid: string;
  profileId: string;
  previousRole: string;
  role: string;
  alreadyRole: boolean;
}

export class AdminBootstrapService {
  constructor(private readonly prisma: PrismaClient) {}

  async promoteAdmin(auth: FirebaseAuthLike, identifier: string): Promise<PromoteAdminResult> {
    const trimmed = (identifier ?? "").trim();
    if (!trimmed) {
      badRequestError("identifier (Firebase UID or email) is required");
    }

    const firebaseUid = await this.resolveFirebaseUid(auth, trimmed);

    const profile = await this.prisma.profile.findUnique({
      where: { firebaseUid },
      select: { id: true, role: true },
    });
    if (!profile) {
      notFoundError(
        "No profile exists for that Firebase user yet; ask them to sign in once (GET /api/profile/me) before promoting"
      );
    }

    // Idempotent: promoting an existing admin is a no-op (no duplicate audit noise).
    if (profile.role === "ADMIN") {
      return {
        firebaseUid,
        profileId: profile.id,
        previousRole: profile.role,
        role: "ADMIN",
        alreadyAdmin: true,
      };
    }

    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: { role: "ADMIN" },
      select: { id: true, role: true },
    });

    await auditLog({
      actorType: "SYSTEM",
      entityType: "profile",
      entityId: profile.id,
      action: "ADMIN_PROMOTED",
      payload: { firebaseUid, previousRole: profile.role },
      prismaClient: this.prisma,
    });

    return {
      firebaseUid,
      profileId: updated.id,
      previousRole: profile.role,
      role: updated.role,
      alreadyAdmin: false,
    };
  }

  /**
   * Assign a BUYER / SELLER / ADMIN / OBSERVER role to an existing profile.
   * Operator-driven via the `role:assign` CLI — this is the documented way an
   * authorised operator grants trading roles after a user has signed in once.
   * Identity is resolved through Firebase (never a client value); the profile
   * must already exist. Idempotent and audit-logged (ROLE_ASSIGNED).
   */
  async assignRole(
    auth: FirebaseAuthLike,
    identifier: string,
    role: string
  ): Promise<AssignRoleResult> {
    const normalized = (role ?? "").trim().toUpperCase();
    if (!ASSIGNABLE_ROLES.includes(normalized as AssignableRole)) {
      badRequestError(`role must be one of ${ASSIGNABLE_ROLES.join(", ")}`);
    }
    const trimmed = (identifier ?? "").trim();
    if (!trimmed) {
      badRequestError("identifier (Firebase UID or email) is required");
    }

    const firebaseUid = await this.resolveFirebaseUid(auth, trimmed);

    const profile = await this.prisma.profile.findUnique({
      where: { firebaseUid },
      select: { id: true, role: true },
    });
    if (!profile) {
      notFoundError(
        "No profile exists for that Firebase user yet; ask them to sign in once (GET /api/profile/me) before assigning a role"
      );
    }

    // Idempotent: assigning the role the user already holds is a no-op.
    if (profile.role === normalized) {
      return {
        firebaseUid,
        profileId: profile.id,
        previousRole: profile.role,
        role: normalized,
        alreadyRole: true,
      };
    }

    const updated = await this.prisma.profile.update({
      where: { id: profile.id },
      data: { role: normalized },
      select: { id: true, role: true },
    });

    await auditLog({
      actorType: "SYSTEM",
      entityType: "profile",
      entityId: profile.id,
      action: "ROLE_ASSIGNED",
      payload: { firebaseUid, previousRole: profile.role, role: normalized },
      prismaClient: this.prisma,
    });

    return {
      firebaseUid,
      profileId: updated.id,
      previousRole: profile.role,
      role: updated.role,
      alreadyRole: false,
    };
  }

  private async resolveFirebaseUid(auth: FirebaseAuthLike, identifier: string): Promise<string> {
    try {
      const user = identifier.includes("@")
        ? await auth.getUserByEmail(identifier)
        : await auth.getUser(identifier);
      return user.uid;
    } catch {
      // The Firebase SDK throws for unknown users and transient failures alike;
      // report a safe 404 without echoing SDK/driver internals.
      notFoundError("No Firebase user matched that identifier");
    }
  }
}
