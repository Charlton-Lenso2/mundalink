// Offer routes: create, mine, status transitions.
//
// POST /api/offers — authenticated buyer creates an offer (buyerId from token).
// GET /api/offers/mine — offers visible to caller (as buyer or via own listings).
// PATCH /api/offers/:id/status — body { status } with valid transitions only.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { prisma } from "../modules/prisma";
import { PrismaOfferService } from "../modules/services/offers-core";
import { OfferAcceptanceService } from "../modules/services/offers-accept";
import { OfferBodyValidation } from "../modules/validation/offer";
import { OFFER_STATUS, toOfferRecord } from "../modules/types/offer";
import { auditLog } from "../modules/auditLog";
import { badRequestError, forbiddenError, notFoundError } from "../middleware/error-handler";

export const offersRouter = Router();

async function profileIdFor(firebaseUid: string): Promise<string> {
  const me = await prisma.profile.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!me) notFoundError("Profile not found; call GET /api/profile/me first");
  return (me as { id: string }).id;
}

offersRouter.post("/", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = OfferBodyValidation.create(req.body);
    const buyerId = await profileIdFor(req.firebaseUid as string);
    const svc = new PrismaOfferService(req.prisma ?? prisma);
    const offer = await svc.create({ ...parsed, buyerId });
    await auditLog({
      actorId: buyerId,
      actorType: "PROFILE",
      entityType: "offer",
      entityId: offer.id,
      action: "OFFER_CREATED",
      prismaClient: req.prisma ?? prisma,
    });
    res.status(201).json({ data: offer });
  } catch (err) {
    next(err);
  }
});

offersRouter.get("/mine", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pid = await profileIdFor(req.firebaseUid as string);
    const svc = new PrismaOfferService(req.prisma ?? prisma);
    const offers = await svc.findMyOffers(pid);
    res.json({ data: offers });
  } catch (err) {
    next(err);
  }
});

offersRouter.patch("/:id/status", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = OfferBodyValidation.status(req.body);
    const pid = await profileIdFor(req.firebaseUid as string);
    const svc = new OfferAcceptanceService(req.prisma ?? prisma);

    if (status === OFFER_STATUS.ACCEPTED) {
      // Seller accepts: need listing owner = caller; buyer id is read server-side.
      const row = await (req.prisma ?? prisma).offer.findUnique({
        where: { id: req.params.id as string },
        select: { buyerId: true, listing: { select: { sellerId: true } } },
      });
      if (!row) notFoundError(`Offer not found: ${req.params.id}`);
      const offer = await svc.accept({
        offerId: req.params.id as string,
        buyerId: (row as { buyerId: string }).buyerId,
        sellerId: pid,
      });
      await auditLog({
        actorId: pid,
        actorType: "PROFILE",
        entityType: "offer",
        entityId: offer.id,
        action: "OFFER_ACCEPTED",
        prismaClient: req.prisma ?? prisma,
      });
      res.json({ data: offer });
      return;
    }

    if (status === OFFER_STATUS.DECLINED) {
      const row = await (req.prisma ?? prisma).offer.findUnique({
        where: { id: req.params.id as string },
        select: { status: true, listing: { select: { sellerId: true } } },
      });
      if (!row) notFoundError(`Offer not found: ${req.params.id}`);
      if ((row as { listing: { sellerId: string } }).listing.sellerId !== pid) {
        forbiddenError("Only the listing owner can decline");
      }
      if ((row as { status: string }).status !== OFFER_STATUS.PENDING) {
        badRequestError("Only PENDING offers can be declined");
      }
      const updated = await (req.prisma ?? prisma).offer.update({
        where: { id: req.params.id as string },
        data: { status: OFFER_STATUS.DECLINED },
      });
      await auditLog({
        actorId: pid,
        actorType: "PROFILE",
        entityType: "offer",
        entityId: updated.id,
        action: "OFFER_DECLINED",
        prismaClient: req.prisma ?? prisma,
      });
      res.json({ data: toOfferRecord(updated) });
      return;
    }

    if (status === OFFER_STATUS.WITHDRAWN) {
      const offer = await svc.withdraw(req.params.id as string, pid);
      res.json({ data: offer });
      return;
    }

    if (status === OFFER_STATUS.EXPIRED) {
      const offer = await svc.expire(req.params.id as string, pid, new Date());
      res.json({ data: offer });
      return;
    }

    badRequestError(`Unsupported status transition: ${status}`);
  } catch (err) {
    next(err);
  }
});
