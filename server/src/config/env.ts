// Centralised environment configuration.
//
// Errors out fast on start if required configuration is missing or malformed.
// Secrets (service-account JSON, DB passwords) are never logged or printed.

import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Only expose values the controller should read; everything else stays in the
// process environment and is never returned to the client or logged.
export const env = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: requireEnv("DATABASE_URL"),
  directUrl: requireEnv("DIRECT_URL"),
  firebaseServiceAccountPath: requireEnv("FIREBASE_SERVICE_ACCOUNT_PATH"),
};

export function validateFirewallOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let normalized = origin.replace(/\/+$/, "");
  // Allow the primary frontend origin and any alias of it.
  return normalized === env.clientUrl;
}
