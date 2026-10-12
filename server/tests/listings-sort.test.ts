// Listing sort tests: whitelisted sortBy/sortOrder reach the ORM as a safe
// orderBy; anything else is rejected with 400 before any DB access.

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { PrismaListingService } from "../src/modules/services/listings";

function fakePrismaCapturingOrderBy() {
  const captured: Array<Record<string, unknown>> = [];
  return {
    captured,
    listing: {
      findMany: async (args: { orderBy: Record<string, unknown> }) => {
        captured.push(args.orderBy);
        return [];
      },
      count: async () => 0,
    },
  };
}

describe("PrismaListingService.findAll sorting", () => {
  it("defaults to newest-first (createdAt desc)", async () => {
    const client = fakePrismaCapturingOrderBy();
    const svc = new PrismaListingService(client as never);
    await svc.findAll(undefined, {}, 1, 20);
    expect(client.captured[0]).toEqual({ createdAt: "desc" });
  });

  it("passes through whitelisted sortBy/sortOrder", async () => {
    const client = fakePrismaCapturingOrderBy();
    const svc = new PrismaListingService(client as never);
    await svc.findAll(undefined, { sortBy: "pricePerUnit", sortOrder: "asc" }, 1, 20);
    expect(client.captured[0]).toEqual({ pricePerUnit: "asc" });
  });
});

describe("GET /api/listings sort validation (route layer)", () => {
  const app = createApp();

  it("rejects a non-whitelisted sortBy with 400", async () => {
    const res = await request(app).get("/api/listings?sortBy=sellerId");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sortBy/);
  });

  it("rejects an invalid sortOrder with 400", async () => {
    const res = await request(app).get("/api/listings?sortOrder=sideways");
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/sortOrder/);
  });

  it("accepts whitelisted sort params (validation passes; DB hit follows)", async () => {
    // Valid params pass route validation; the subsequent DB read depends on
    // connectivity, so only assert the validation gate did not reject with 400.
    const res = await request(app).get("/api/listings?sortBy=quantity&sortOrder=DESC");
    expect(res.status).not.toBe(400);
  });
});
