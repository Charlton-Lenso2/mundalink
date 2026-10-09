// Listing routes: search/list, detail, create, owner update.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { PrismaListingService } from "../modules/services/listings";
import { ListingWriteService } from "../modules/services/listings-write";
import { ListingValidation } from "../modules/validation/listing";
import { prisma } from "../modules/prisma";
import { badRequestError, forbiddenError, notFoundError } from "../middleware/error-handler";
import type { ListingStatus } from "../modules/types/listing";

export const listingsRouter = Router();

function parsePaging(q: Request["query"]): { page: number; limit: number } {
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20) || 20));
  return { page, limit };
}

// GET /api/listings?search=&category=&location=&status=&page=&limit=
listingsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const status =
      typeof req.query.status === "string"
        ? (req.query.status.toUpperCase() as ListingStatus)
        : undefined;
    if (status !== undefined && !["DRAFT", "ACTIVE", "REJECTED", "SOLD"].includes(status)) {
      badRequestError("status must be one of DRAFT, ACTIVE, REJECTED, SOLD");
    }
    const svc = new PrismaListingService(prisma);
    const result = await svc.findAll(
      undefined,
      {
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        location: typeof req.query.location === "string" ? req.query.location : undefined,
        status,
        search: typeof req.query.search === "string" ? req.query.search : undefined,
      },
      page,
      limit
    );
    res.json({ data: result.items, meta: { page, limit, total: result.total, totalPages: result.totalPages } });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/:id
listingsRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const svc = new PrismaListingService(prisma);
    const listing = await svc.findById(req.params.id as string, prisma);
    if (!listing) notFoundError(`Listing not found: ${req.params.id}`);
    res.json({ data: listing });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings (seller, authenticated; owner = verified UID)
listingsRouter.post("/", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ListingValidation.create({ ...req.body, sellerId: "x" });
    const me = await (req.prisma ?? prisma).profile.findUnique({
      where: { firebaseUid: req.firebaseUid as string },
      select: { id: true },
    });
    if (!me) notFoundError("Profile not found; call GET /api/profile/me first");
    const listing = await ListingWriteService.create(
      { ...parsed, sellerId: (me as { id: string }).id },
      req.prisma ?? prisma
    );
    res.status(201).json({ data: listing });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/listings/:id (owner only; permitted fields enforced by validator)
listingsRouter.patch("/:id", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ListingValidation.update(req.body);
    const me = await (req.prisma ?? prisma).profile.findUnique({
      where: { firebaseUid: req.firebaseUid as string },
      select: { id: true },
    });
    if (!me) notFoundError("Profile not found");
    const existing = await (req.prisma ?? prisma).listing.findUnique({
      where: { id: req.params.id as string },
      select: { sellerId: true },
    });
    if (!existing) notFoundError(`Listing not found: ${req.params.id}`);
    if (existing.sellerId !== (me as { id: string }).id) forbiddenError("Only the owner can update");
    const listing = await ListingWriteService.update(
      req.params.id as string,
      parsed,
      (me as { id: string }).id,
      req.prisma ?? prisma
    );
    res.json({ data: listing });
  } catch (err) {
    next(err);
  }
});
