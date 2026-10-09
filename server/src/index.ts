// Server entrypoint: validate env, init Firebase Admin, connect Prisma, listen.

import { env } from "./config/env";
import { initializeFirebaseAdmin } from "./config/firebase";
import { prisma } from "./modules/prisma";
import { createApp } from "./app";

async function main(): Promise<void> {
  // Fail fast on missing config (message names the var, never its value).
  void env;
  initializeFirebaseAdmin();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Classify without secrets: pooler vs direct vs TLS vs env.
    // eslint-disable-next-line no-console
    console.error(`[startup] database connectivity check failed: ${message}`);
    process.exit(1);
  }

  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[mundalink] api listening on :${env.port} (${env.nodeEnv})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[startup] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
