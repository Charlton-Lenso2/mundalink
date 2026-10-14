// Offer routes: create, mine, status transitions.
//
// POST /api/offers — authenticated buyer creates an offer (buyerId from token).
// GET /api/offers/mine — offers visible to caller (as buyer or via own listings).
// PATCH /api/offers/:id/status — body { status } with valid transitions only.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole, resolveRole, assertRole } from "../middleware/rbac";
import { prisma } from "../modules/prisma";
import { PrismaOfferService } from "../modules/services/offers-core";
import { OfferAcceptanceService } from "../modules/services/offers-accept";
import { NotificationService } from "../modules/services/notifications";
import { OfferBodyValidation } from "../modules/validation/offer";
import { OFFER_STATUS } from "../modules/types/offer";
import { auditLog } from "../modules/auditLog";
import { badRequestError, notFoundError } from "../middleware/error-handler";

export const offersRouter = Router();

async function profileIdFor(firebaseUid: string): Promise<string> {
  const me = await prisma.profile.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!me) notFoundError("Profile not found; call GET /api/profile/me first");
  return (me as { id: string }).id;
}

// POST /api/offers — BUYER only, authenticated (buyerId from token).
offersRouter.post("/", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
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
    // Real event -> notify the listing's seller that a new offer arrived.
    // The seller id is read server-side from the listing (never the body).
    const listing = await (req.prisma ?? prisma).listing.findUnique({
      where: { id: parsed.listingId },
      select: { sellerId: true, title: true },
    });
    if (listing && listing.sellerId !== buyerId) {
      await NotificationService.notify(
        {
          recipientId: listing.sellerId,
          entityType: "offer",
          entityId: offer.id,
          type: "OFFER_RECEIVED",
          title: `New offer on "${listing.title}"`,
          body: `${offer.offeredQuantity} @ ${offer.offeredPrice}`,
        },
        req.prisma ?? prisma
      );
    }
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
    // Role is resolved server-side from the DB (never the body). The required
    // role depends on the target status, enforced per-branch below.
    const role = await resolveRole(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new OfferAcceptanceService(req.prisma ?? prisma);

    if (status === OFFER_STATUS.ACCEPTED) {
      // SELLER-only: only a SELLER who also owns the listing may accept.
      assertRole(role, "SELLER");
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
      // Real event -> tell the buyer their offer was accepted (a deal now exists).
      await NotificationService.notify(
        {
          recipientId: offer.buyerId,
          entityType: "offer",
          entityId: offer.id,
          type: "OFFER_ACCEPTED",
          title: "Your offer was accepted",
          body: `An agreed deal was created for ${offer.offeredQuantity} @ ${offer.offeredPrice}.`,
        },
        req.prisma ?? prisma
      );
      res.json({ data: offer });
      return;
    }

    if (status === OFFER_STATUS.DECLINED) {
      // SELLER-only: only the listing owner (a SELLER) may decline.
      assertRole(role, "SELLER");
      // Business rules (owner-only, PENDING-only) live in the service, where
      // they run inside the same transaction as the status change.
      const offer = await svc.decline(req.params.id as string, pid);
      await auditLog({
        actorId: pid,
        actorType: "PROFILE",
        entityType: "offer",
        entityId: offer.id,
        action: "OFFER_DECLINED",
        prismaClient: req.prisma ?? prisma,
      });
      await NotificationService.notify(
        {
          recipientId: offer.buyerId,
          entityType: "offer",
          entityId: offer.id,
          type: "OFFER_DECLINED",
          title: "Your offer was declined",
          body: null,
        },
        req.prisma ?? prisma
      );
      res.json({ data: offer });
      return;
    }

    if (status === OFFER_STATUS.WITHDRAWN) {
      // BUYER-only: only the offer's buyer (a BUYER) may withdraw.
      assertRole(role, "BUYER");
      const offer = await svc.withdraw(req.params.id as string, pid);
      await auditLog({
        actorId: pid,
        actorType: "PROFILE",
        entityType: "offer",
        entityId: offer.id,
        action: "OFFER_WITHDRAWN",
        prismaClient: req.prisma ?? prisma,
      });
      // Real event -> tell the seller a pending offer on their listing was withdrawn.
      const listing = await (req.prisma ?? prisma).listing.findUnique({
        where: { id: offer.listingId },
        select: { sellerId: true },
      });
      if (listing && listing.sellerId !== pid) {
        await NotificationService.notify(
          {
            recipientId: listing.sellerId,
            entityType: "offer",
            entityId: offer.id,
            type: "OFFER_WITHDRAWN",
            title: "An offer on your listing was withdrawn",
            body: null,
          },
          req.prisma ?? prisma
        );
      }
      res.json({ data: offer });
      return;
    }

    if (status === OFFER_STATUS.EXPIRED) {
      // BUYER-only: only the offer's buyer (a BUYER) may expire their offer.
      assertRole(role, "BUYER");
      const offer = await svc.expire(req.params.id as string, pid, new Date());
      await auditLog({
        actorId: pid,
        actorType: "PROFILE",
        entityType: "offer",
        entityId: offer.id,
        action: "OFFER_EXPIRED",
        prismaClient: req.prisma ?? prisma,
      });
      // Real event -> tell the seller a pending offer on their listing expired.
      const listing = await (req.prisma ?? prisma).listing.findUnique({
        where: { id: offer.listingId },
        select: { sellerId: true },
      });
      if (listing && listing.sellerId !== pid) {
        await NotificationService.notify(
          {
            recipientId: listing.sellerId,
            entityType: "offer",
            entityId: offer.id,
            type: "OFFER_WITHDRAWN",
            title: "An offer on your listing expired",
            body: null,
          },
          req.prisma ?? prisma
        );
      }
      res.json({ data: offer });
      return;
    }

    badRequestError(`Unsupported status transition: ${status}`);
  } catch (err) {
    next(err);
  }
});
