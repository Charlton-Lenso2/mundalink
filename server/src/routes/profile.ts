// Profile routes: GET/PATCH /api/profile/me (authenticated).

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { ProfileService } from "../modules/services/profiles";
import { ProfileValidation } from "../modules/validation/profile";
import { prisma } from "../modules/prisma";

export const profileRouter = Router();

profileRouter.get(
  "/me",
  authenticate(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const svc = new ProfileService(req.prisma ?? prisma);
      const profile = await svc.getOrInit(req.firebaseUid as string);
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  }
);

profileRouter.patch(
  "/me",
  authenticate(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ProfileValidation.update(req.body);
      // Role escalation guard: only admins may set role. Everyone else gets
      // role stripped so self-promotion to ADMIN is impossible.
      const me = await (req.prisma ?? prisma).profile.findUnique({
        where: { firebaseUid: req.firebaseUid as string },
        select: { role: true },
      });
      if (me?.role !== "ADMIN") delete parsed.role;
      const svc = new ProfileService(req.prisma ?? prisma);
      const profile = await svc.update(req.firebaseUid as string, parsed);
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  }
);
