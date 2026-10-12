// Deal routes: GET /api/deals/mine + PATCH /api/deals/:id/status (fulfilment).

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../modules/prisma";
import { DealService } from "../modules/services/deals";
import { DealBodyValidation } from "../modules/validation/deal";
import { DEAL_STATUS } from "../modules/types/deal";
import { auditLog } from "../modules/auditLog";
import { badRequestError } from "../middleware/error-handler";

export const dealsRouter = Router();

async function profileIdFor(firebaseUid: string, client: typeof prisma): Promise<string> {
  const me = await client.profile.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!me) badRequestError("Profile not found; call GET /api/profile/me first");
  return (me as { id: string }).id;
}

dealsRouter.get("/mine", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = req.prisma ?? prisma;
    const pid = await profileIdFor(req.firebaseUid as string, client);
    const svc = new DealService(client);
    const deals = await svc.findMine(pid);
    res.json({ data: deals });
  } catch (err) {
    next(err);
  }
});

// GET /api/deals/:id/history — participant-only status history (audit-sourced).
dealsRouter.get("/:id/history", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = req.prisma ?? prisma;
    const pid = await profileIdFor(req.firebaseUid as string, client);
    const svc = new DealService(client);
    const history = await svc.history(req.params.id as string, pid);
    res.json({ data: history });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/deals/:id/status — body { status: CONFIRMED | COMPLETED | CANCELLED }.
// Buyer or seller only. PENDING -> CONFIRMED/CANCELLED; CONFIRMED -> COMPLETED/CANCELLED.
dealsRouter.patch("/:id/status", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = DealBodyValidation.status(req.body);
    const client = req.prisma ?? prisma;
    const pid = await profileIdFor(req.firebaseUid as string, client);
    const svc = new DealService(client);
    const deal = await svc.transition(req.params.id as string, pid, status);
    await auditLog({
      actorId: pid,
      actorType: "PROFILE",
      entityType: "deal",
      entityId: deal.id,
      action: status === DEAL_STATUS.CANCELLED ? "DEAL_CANCELLED" : "DEAL_EXECUTED",
      payload: { status },
      prismaClient: client,
    });
    res.json({ data: deal });
  } catch (err) {
    next(err);
  }
});
