// Firebase Admin SDK initialisation.
//
// The admin SDK is used ONLY to verify Firebase ID tokens on the backend. We do
// not touch Firestore or client-side Firebase SDKs here.
//
// The service-account JSON is loaded from FIREBASE_SERVICE_ACCOUNT_PATH (a file
// path, not the JSON contents), so the private key never needs to live in
// process.env and is never logged.

import { initializeApp, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import path from "node:path";

export let adminApp: ReturnType<typeof initializeApp> | undefined;
export let auth: ReturnType<typeof getAuth> | undefined;

export function initializeFirebaseAdmin(): void {
  if (adminApp) {
    return;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!serviceAccountPath) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not set. The backend cannot verify Firebase ID tokens without it."
    );
  }

  // Read the file at startup (secrets are loaded once, never logged).
  const resolved = path.resolve(serviceAccountPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Firebase service-account file not found: ${resolved}. ` +
        "Check FIREBASE_SERVICE_ACCOUNT_PATH in the environment."
    );
  }

  const raw = fs.readFileSync(resolved, "utf8");

  let account: ServiceAccount;
  try {
    account = typeof raw === "object" ? raw : JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse Firebase service-account JSON at ${resolved}: ${(err as Error).message}`
    );
  }

  adminApp = initializeApp({
    credential: cert(account),
  });

  auth = getAuth(adminApp);
}

export function getFirebaseAdmin(): {
  app: ReturnType<typeof initializeApp>;
  auth: ReturnType<typeof getAuth>;
} {
  if (!adminApp || !auth) {
    throw new Error(
      "Firebase Admin SDK has not been initialised. Call initializeFirebaseAdmin() on startup."
    );
  }
  return { app: adminApp, auth };
}
