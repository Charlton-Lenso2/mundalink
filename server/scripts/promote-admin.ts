// Operator CLI: promote a Firebase user's profile to ADMIN (first-admin
// bootstrap and out-of-band role assignment).
//
// Usage (from server/):
//   npm run admin:promote -- <firebaseUid-or-email>
//
// This is the ONLY sanctioned way to create the first administrator: there is
// no HTTP endpoint that grants ADMIN. It must be run by an operator with access
// to the server environment (and service-account file). Every promotion is
// recorded in the audit log (action ADMIN_PROMOTED). Prints only the profile
// id, Firebase UID, and role — never credentials or environment values.

import "dotenv/config";
import { initializeFirebaseAdmin, getFirebaseAdmin } from "../src/config/firebase";
import { prisma } from "../src/modules/prisma";
import { AdminBootstrapService } from "../src/modules/services/admin";

async function main(): Promise<void> {
  const identifier = process.argv[2];
  if (!identifier || identifier.trim() === "") {
    console.error("Usage: npm run admin:promote -- <firebaseUid-or-email>");
    process.exit(1);
  }

  initializeFirebaseAdmin();
  const { auth } = getFirebaseAdmin();

  const svc = new AdminBootstrapService(prisma);
  const result = await svc.promoteAdmin(auth, identifier);

  if (result.alreadyAdmin) {
    console.log(
      `Already ADMIN: profile ${result.profileId} (firebaseUid ${result.firebaseUid})`
    );
  } else {
    console.log(
      `Promoted to ADMIN: profile ${result.profileId} ` +
        `(firebaseUid ${result.firebaseUid}, previous role ${result.previousRole})`
    );
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`admin:promote failed: ${message}`);
  process.exit(1);
});
