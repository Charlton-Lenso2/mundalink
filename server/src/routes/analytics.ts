// Analytics routes: GET /api/analytics/summary (authenticated).
//
// Global platform aggregates computed from stored data. Authenticated because
// deal values are commercial figures; the response contains only global
// aggregates, never per-user breakdowns.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../modules/prisma";
import { AnalyticsService } from "../modules/services/analytics";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/summary",
  authenticate(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = new AnalyticsService(req.prisma ?? prisma);
      const summary = await svc.summary();
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  }
);
