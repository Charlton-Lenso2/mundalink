// Health route: liveness + DB connectivity reported separately.

import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

export async function healthHandler(_req: Request, res: Response): Promise<void> {
  let db: "up" | "down" = "down";
  let dbError: string | undefined;
  try {
    const client = new PrismaClient();
    try {
      await client.$queryRaw`SELECT 1`;
      db = "up";
    } finally {
      await client.$disconnect();
    }
  } catch (err) {
    db = "down";
    dbError = err instanceof Error ? err.message : "unknown database error";
  }
  const ok = db === "up";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: dbError ? { status: db, error: dbError } : { status: db },
  });
}
