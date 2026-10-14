// Requirement + contribution routes. See docs/api-contract.md "Buyer
// requirements & produce aggregation" for the full contract.
//
// Requirements (BUYER trading role for writes):
//   POST   /api/requirements              create (BUYER only)
//   GET    /api/requirements              open requirements, filters + pagination (public)
//   GET    /api/requirements/mine         my requirements (auth)
//   GET    /api/requirements/:id          view (owner any status; others OPEN/PARTIALLY_FULFILLED)
//   PATCH  /api/requirements/:id          owner edit while OPEN (BUYER only)
//   POST   /api/requirements/:id/cancel   owner cancel (BUYER only)
//   GET    /api/requirements/:id/aggregation  aggregation view (auth, participant-scoped)
//
// Contributions (mixed trading roles):
//   POST   /api/requirements/:id/contributions  propose from own listing (SELLER only)
//   POST   /api/contributions/:id/commit         bind: reserve inventory + demand (BUYER owner)
//   POST   /api/contributions/:id/fulfil         mark delivered (BUYER owner)
//   POST   /api/contributions/:id/cancel         PROPOSED: seller; COMMITTED: buyer owner
//
// Ownership is resolved server-side from the verified Firebase UID (never the
// body). Roles are enforced via requireRole on top of auth + ownership checks.

import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { prisma } from "../modules/prisma";
import { RequirementService } from "../modules/services/requirements";
import { ContributionService } from "../modules/services/contributions";
import { RequirementValidation } from "../modules/validation/requirement";
import { ContributionValidation } from "../modules/validation/contribution";
import { badRequestError, notFoundError } from "../middleware/error-handler";

export const requirementsRouter = Router();

async function profileIdFor(firebaseUid: string, client = prisma): Promise<string> {
  const me = await client.profile.findUnique({
    where: { firebaseUid },
    select: { id: true },
  });
  if (!me) notFoundError("Profile not found; call GET /api/profile/me first");
  return (me as { id: string }).id;
}

function parsePaging(q: Request["query"]): { page: number; limit: number } {
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20) || 20));
  return { page, limit };
}

// POST /api/requirements (BUYER only; buyerId from verified token)
requirementsRouter.post("/", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = RequirementValidation.create(req.body);
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const requirement = await svc.create({
      buyerId,
      title: parsed.title,
      description: parsed.description ?? null,
      qualityNotes: parsed.qualityNotes ?? null,
      category: parsed.category ?? null,
      commodity: parsed.commodity ?? null,
      quantity: parsed.quantity,
      unit: parsed.unit,
      location: parsed.location ?? null,
      neededBy: parsed.neededBy ?? null,
      targetPrice: parsed.targetPrice ?? null,
      currency: parsed.currency ?? "USD",
    });
    res.status(201).json({ data: requirement });
  } catch (err) {
    next(err);
  }
});

// GET /api/requirements?commodity=&category=&location=&unit=&neededByFrom=&page=&limit= (public)
requirementsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parsePaging(req.query);
    let neededByFrom: Date | undefined;
    if (typeof req.query.neededByFrom === "string" && req.query.neededByFrom.trim() !== "") {
      neededByFrom = new Date(req.query.neededByFrom);
      if (Number.isNaN(neededByFrom.getTime())) badRequestError("neededByFrom must be a valid date");
    }
    const svc = new RequirementService(req.prisma ?? prisma);
    const result = await svc.findOpen(
      {
        commodity: typeof req.query.commodity === "string" ? req.query.commodity : undefined,
        category: typeof req.query.category === "string" ? req.query.category : undefined,
        location: typeof req.query.location === "string" ? req.query.location : undefined,
        unit: typeof req.query.unit === "string" ? req.query.unit : undefined,
        neededByFrom,
      },
      page,
      limit
    );
    res.json({ data: result.items, meta: { page, limit, total: result.total, totalPages: result.totalPages } });
  } catch (err) {
    next(err);
  }
});

export const contributionsRouter = Router();


// GET /api/requirements/mine (auth: my requirements, any status)
requirementsRouter.get("/mine", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parsePaging(req.query);
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const result = await svc.findMine(buyerId, page, limit);
    res.json({ data: result.items, meta: { page, limit, total: result.total, totalPages: result.totalPages } });
  } catch (err) {
    next(err);
  }
});

// GET /api/requirements/:id (owner any status; others discoverable statuses only)
requirementsRouter.get("/:id", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const record = await svc.findById(id, buyerId);
    if (!record) notFoundError(`Requirement not found: ${id}`);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requirements/:id (BUYER owner, OPEN only)
requirementsRouter.patch("/:id", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const parsed = RequirementValidation.update(req.body);
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const record = await svc.update(id, parsed, buyerId);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});

// POST /api/requirements/:id/cancel (BUYER owner, OPEN/PARTIALLY_FULFILLED)
requirementsRouter.post("/:id/cancel", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const record = await svc.cancel(id, buyerId);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});

// GET /api/requirements/:id/aggregation (auth: buyer owner or contributing sellers, buyer emails hidden from sellers)
requirementsRouter.get("/:id/aggregation", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const viewerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new RequirementService(req.prisma ?? prisma);
    const agg = await svc.getAggregation(id, viewerId);
    if (!agg) notFoundError(`Requirement not found: ${id}`);
    res.json({ data: agg });
  } catch (err) {
    next(err);
  }
});

// POST /api/requirements/:id/contributions (SELLER only, own ACTIVE listing)
requirementsRouter.post("/:id/contributions", authenticate(), requireRole("SELLER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const parsed = ContributionValidation.propose(req.body);
    const sellerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new ContributionService(req.prisma ?? prisma);
    const record = await svc.propose(id, sellerId, parsed.listingId, parsed.quantity);
    res.status(201).json({ data: record });
  } catch (err) {
    next(err);
  }
});

// POST /api/contributions/:id/commit (BUYER requirement owner)
contributionsRouter.post("/:id/commit", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new ContributionService(req.prisma ?? prisma);
    const record = await svc.commit(id, buyerId);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});

// POST /api/contributions/:id/fulfil (BUYER requirement owner)
contributionsRouter.post("/:id/fulfil", authenticate(), requireRole("BUYER"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const buyerId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new ContributionService(req.prisma ?? prisma);
    const record = await svc.fulfil(id, buyerId);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});

// POST /api/contributions/:id/cancel (PROPOSED: owning seller; COMMITTED: buyer owner)
contributionsRouter.post("/:id/cancel", authenticate(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const actorId = await profileIdFor(req.firebaseUid as string, req.prisma ?? prisma);
    const svc = new ContributionService(req.prisma ?? prisma);
    const record = await svc.cancel(id, actorId);
    res.json({ data: record });
  } catch (err) {
    next(err);
  }
});
