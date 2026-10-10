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

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 5000;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT value: ${raw}. PORT must be an integer between 1 and 65535.`);
  }
  return parsed;
}

// Only expose values the controller should read; everything else stays in the
// process environment and is never returned to the client or logged.
export const env = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? "development",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: requireEnv("DATABASE_URL"),
  directUrl: requireEnv("DIRECT_URL"),
  firebaseServiceAccountPath: requireEnv("FIREBASE_SERVICE_ACCOUNT_PATH"),
};

export function validateFirewallOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let normalized = origin;
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  let client = env.clientUrl;
  while (client.length > 1 && client.charAt(client.length - 1) === "/") client = client.slice(0, -1);
  // Allow the primary frontend origin (trailing slashes ignored). //.replace(/\/+$/, "");
  // Allow the primary frontend origin and any alias of it.
  return normalized === client;
}
