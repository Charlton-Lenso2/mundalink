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
