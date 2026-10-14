// Route-level role enforcement (no DB; Firebase + Prisma mocked).
//
// Proves the trading policy at the HTTP boundary:
//   - OBSERVER cannot create listings/offers or accept/withdraw offers.
//   - BUYER cannot perform SELLER-only ops (create listing, accept/decline).
//   - SELLER cannot perform BUYER-only ops (create offer, withdraw/expire).
// Any DB call BEYOND the role gate throws (UNREACHED), so a bypassed gate would
// surface as a 500 and fail these assertions instead of silently passing.

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const state = vi.hoisted(() => ({ role: "OBSERVER" }));

vi.mock("../src/config/firebase", () => ({
  getFirebaseAdmin: () => ({
    auth: {
      verifyIdToken: async (token: string) => {
        if (token === "valid") return { uid: "uid-1", email: "u@example.com" };
        throw new Error("invalid token");
      },
    },
  }),
}));

vi.mock("../src/modules/prisma", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boom = (name: string) => async (): Promise<never> => {
    throw new Error(`UNREACHED_DB_CALL:${name}`);
  };
  return {
    prisma: {
      profile: { findUnique: async () => ({ id: "profile-1", role: state.role }) },
      listing: {
        findMany: async () => [],
        count: async () => 0,
        findUnique: boom("listing.findUnique"),
        create: boom("listing.create"),
        update: boom("listing.update"),
        updateMany: boom("listing.updateMany"),
      },
      inventory: { create: boom("inventory.create"), updateMany: boom("inventory.updateMany") },
      offer: {
        findUnique: boom("offer.findUnique"),
        findFirst: boom("offer.findFirst"),
        findMany: async () => [],
        create: boom("offer.create"),
        update: boom("offer.update"),
        updateMany: boom("offer.updateMany"),
      },
      agreedDeal: { upsert: boom("agreedDeal.upsert"), findUnique: boom("agreedDeal.findUnique"), findMany: async () => [] },
      auditLog: { create: async () => ({}) },
      notification: { create: async () => ({}) },
    },
  };
});

import { createApp } from "../src/app";

const app = createApp();
const AUTH = { Authorization: "Bearer valid" };

async function asRole(role: string) {
  state.role = role;
}

describe("OBSERVER cannot trade", () => {
  beforeEach(() => asRole("OBSERVER"));

  it("403 on POST /api/listings", async () => {
    const res = await request(app).post("/api/listings").set(AUTH).send({ title: "Maize", quantity: "10", pricePerUnit: "5", availableQuantity: "10" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires SELLER role/i);
  });

  it("403 on POST /api/offers", async () => {
    const res = await request(app).post("/api/offers").set(AUTH).send({ listingId: "lst_1", offeredQuantity: "5", offeredPrice: "5" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires BUYER role/i);
  });

  it("403 on accepting an offer (SELLER-only)", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "ACCEPTED" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires SELLER role/i);
  });

  it("403 on withdrawing an offer (BUYER-only)", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "WITHDRAWN" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires BUYER role/i);
  });

  it("still allows public marketplace reads (200)", async () => {
    const res = await request(app).get("/api/listings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe("BUYER cannot perform SELLER-only operations", () => {
  beforeEach(() => asRole("BUYER"));

  it("403 on POST /api/listings", async () => {
    const res = await request(app).post("/api/listings").set(AUTH).send({ title: "Maize", quantity: "10", pricePerUnit: "5", availableQuantity: "10" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires SELLER role/i);
  });

  it("403 on accepting an offer", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "ACCEPTED" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires SELLER role/i);
  });

  it("403 on declining an offer", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "DECLINED" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires SELLER role/i);
  });
});

describe("SELLER cannot perform BUYER-only operations", () => {
  beforeEach(() => asRole("SELLER"));

  it("403 on POST /api/offers", async () => {
    const res = await request(app).post("/api/offers").set(AUTH).send({ listingId: "lst_1", offeredQuantity: "5", offeredPrice: "5" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires BUYER role/i);
  });

  it("403 on withdrawing an offer", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "WITHDRAWN" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires BUYER role/i);
  });

  it("403 on expiring an offer", async () => {
    const res = await request(app).patch("/api/offers/off_1/status").set(AUTH).send({ status: "EXPIRED" });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/requires BUYER role/i);
  });
});

describe("authentication still precedes role checks", () => {
  it("401 when no token is supplied (even for a role-gated route)", async () => {
    const res = await request(app).post("/api/listings").send({});
    expect(res.status).toBe(401);
  });
});

