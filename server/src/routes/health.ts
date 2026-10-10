// Health route: liveness + DB connectivity reported separately.

import type { Request, Response } from "express";
import { prisma } from "../modules/prisma";

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  let db: "up" | "down" = "down";
  let dbError: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch (err) {
    db = "down";
    // Never leak raw driver messages (they can contain host/user fragments).
    // Log full error server-side, return a generic reason to clients.
    // eslint-disable-next-line no-console
    console.error(`[health] database check failed: ${err instanceof Error ? err.message : String(err)}`);
    dbError = "database unreachable";
  }
  const ok = db === "up";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbError ? { status: db, error: dbError } : { status: db },
  });
}
