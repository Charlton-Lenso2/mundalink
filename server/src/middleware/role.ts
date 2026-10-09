// Safe role extraction from a verified Firebase user, with fallback to the
// PostgreSQL profile. Used by deal/offer acceptance to enforce ownership.

import { getFirebaseAdmin } from "../config/firebase";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export type Role = "SELLER" | "BUYER" | "ADMIN" | "OBSERVER";

/**
 * Read the acting user's role.
 *   1. If the Firebase user has a `role` custom claim, use it.
 *   2. Otherwise fall back to the PostgreSQL `profiles` table (the caller must
 *      have `req.prisma` attached and `req.firebaseUid` set).
 */
export async function getRole(
  uid: string,
  prismaClient: PrismaClient
): Promise<Role> {
  const { auth } = getFirebaseAdmin();
  const user = await auth.getUser(uid).catch(() => null);
  if (user?.customClaims?.role) {
    return user.customClaims.role as Role;
  }
  // Fallback: read the local profile role.
  const profile = await prismaClient.profile.findUnique({
    where: { firebaseUid: uid },
    select: { role: true },
  });
  return (profile?.role ?? "OBSERVER") as Role;
}


