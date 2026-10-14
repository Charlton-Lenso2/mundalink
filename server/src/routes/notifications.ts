// Notification routes: list mine, mark one read, mark all read.
//
// Notifications are produced by REAL events elsewhere (offer/deal routes call
// NotificationService.notify). These endpoints only read and mark-read for the
// authenticated user; there is no create endpoint — clients cannot fabricate
// notifications.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../modules/prisma";
import { NotificationService } from "../modules/services/notifications";
import { notFoundError } from "../middleware/error-handler";

export const notificationsRouter = Router();

async function profileIdFor(firebaseUid: string, client = prisma): Promise<string> {
  const me = await client.profile.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!me) notFoundError("Profile not found; call GET /api/profile/me first");
  return (me as { id: string }).id;
}

function parseLimit(q: Request["query"]): number | undefined {
  if (typeof q.limit !== "string" || q.limit.trim() === "") return undefined;
  const parsed = Number(q.limit);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

// GET /api/notifications/mine?limit= — newest first, with unreadCount.
notificationsRouter.get("/mine", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pid = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new NotificationService(req.prisma ?? prisma);
    const result = await svc.listMine(pid, parseLimit(req.query));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all — mark all of the caller's unread as read.
// Defined BEFORE "/:id/read" so "read-all" is never treated as an :id.
notificationsRouter.patch("/read-all", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pid = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new NotificationService(req.prisma ?? prisma);
    const result = await svc.markAllRead(pid);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read — mark one as read (owner only).
notificationsRouter.patch("/:id/read", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pid = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new NotificationService(req.prisma ?? prisma);
    const notification = await svc.markRead(pid, req.params.id as string);
    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
});
