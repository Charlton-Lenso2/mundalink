// Deal routes: GET /api/deals/mine — deals where caller is buyer or seller.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../modules/prisma";
import { DealService } from "../modules/services/deals";
import { badRequestError } from "../middleware/error-handler";

export const dealsRouter = Router();

dealsRouter.get("/mine", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = await (req.prisma ?? prisma).profile.findUnique({
      where: { firebaseUid: req.firebaseUid as string },
      select: { id: true },
    });
    if (!me) badRequestError("Profile not found; call GET /api/profile/me first");
    const svc = new DealService(req.prisma ?? prisma);
    const deals = await svc.findMine((me as { id: string }).id);
    res.json({ data: deals });
  } catch (err) {
    next(err);
  }
});
