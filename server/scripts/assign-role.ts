// Operator CLI: assign a BUYER, SELLER, ADMIN, or OBSERVER role to an existing
// Firebase user's profile (role onboarding for new users).
//
// Usage (from server/):
//   npm run role:assign -- <firebaseUid-or-email> <BUYER|SELLER|ADMIN|OBSERVER>
//
// This is the documented way an authorised OPERATOR grants trading roles after
// a user has signed in once. It is server-side only (no HTTP endpoint), runs
// with the normal server environment (.env + Firebase service-account file),
// resolves identity through Firebase (never a client value), and records every
// change in the audit log (action ROLE_ASSIGNED). For the very first
// administrator, prefer `npm run admin:promote` (see scripts/promote-admin.ts).
//
// Prints only the profile id, Firebase UID, and role — never credentials.

import "dotenv/config";
import { initializeFirebaseAdmin, getFirebaseAdmin } from "../src/config/firebase";
import { prisma } from "../src/modules/prisma";
import { AdminBootstrapService } from "../src/modules/services/admin";

async function main(): Promise<void> {
  const identifier = process.argv[2];
  const role = (process.argv[3] ?? "").trim().toUpperCase();

  if (!identifier || identifier.trim() === "" || !role) {
    console.error(
      "Usage: npm run role:assign -- <firebaseUid-or-email> <BUYER|SELLER|ADMIN|OBSERVER>"
    );
    process.exit(1);
  }

  initializeFirebaseAdmin();
  const { auth } = getFirebaseAdmin();

  const svc = new AdminBootstrapService(prisma);
  const result = await svc.assignRole(auth, identifier, role);

  if (result.alreadyRole) {
    console.log(`Already ${result.role}: profile ${result.profileId} (firebaseUid ${result.firebaseUid})`);
  } else {
    console.log(
      `Assigned ${result.role}: profile ${result.profileId} ` +
        `(firebaseUid ${result.firebaseUid}, previous role ${result.previousRole})`
    );
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`role:assign failed: ${message}`);
  process.exit(1);
});
