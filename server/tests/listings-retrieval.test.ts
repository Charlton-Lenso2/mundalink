// Regression test for the reported integration failure.
//
// Copilot reported: "the marketplace listings request returned HTTP 400 with
// the message 'A related record is missing or invalid'". That exact string is
// produced ONLY by error-handler.ts for a Prisma P2003 (foreign-key
// constraint), which can only occur on a WRITE (create/update) — never on a
// read. A valid GET /api/listings must therefore return HTTP 200 with a
// well-formed { data, meta } envelope. Bad *query* params, by contrast, return
// 400 with a DIFFERENT ValidationError message ("sortBy must be one of ...").
//
// Prisma is mocked (same pattern as auth.test.ts) so this test is deterministic
// and needs no live database.

import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const { listingRows } = vi.hoisted(() => ({
  listingRows: [
    {
      id: "lst_1",
      sellerId: "seller_1",
      title: "Maize grain",
      description: "White maize, 50kg bags",
      category: "Cereals",
      commodity: "Maize",
      quantity: "100",
      unit: "bags",
      pricePerUnit: "18.5",
      currency: "USD",
      location: "Harare",
      latitude: null,
      longitude: null,
      status: "ACTIVE",
      availableQuantity: "80",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      seller: { displayName: "Test Seller" },
    },
    {
      id: "lst_2",
      sellerId: "seller_2",
      title: "Sugar beans",
      description: null,
      category: "Legumes",
      commodity: "Beans",
      quantity: "40",
      unit: "kg",
      pricePerUnit: "2.2",
      currency: "USD",
      location: "Bulawayo",
      latitude: null,
      longitude: null,
      status: "ACTIVE",
      availableQuantity: "40",
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      seller: { displayName: null },
    },
  ],
}));

vi.mock("../src/modules/prisma", () => ({
  prisma: {
    listing: {
      findMany: async () => listingRows,
      count: async () => listingRows.length,
    },
  },
}));

import { createApp } from "../src/app";

const app = createApp();

const P2003_MESSAGE = /related record is missing or invalid/i;

describe("GET /api/listings retrieval (regression)", () => {
  it("returns 200 with a paginated envelope for the simplest valid request", async () => {
    const res = await request(app).get("/api/listings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(listingRows.length);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(res.body.meta.total).toBe(listingRows.length);
    expect(res.body.meta.totalPages).toBe(1);
  });

  it("returns 200 for the exact query params the frontend marketplace sends", async () => {
    const res = await request(app).get("/api/listings?status=ACTIVE&page=1&limit=9");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 9 });
  });

  it("never surfaces the P2003 message on a retrieval (search + category filters)", async () => {
    const res = await request(app).get("/api/listings?search=maize&category=Cereals&sortBy=pricePerUnit&sortOrder=ASC");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(P2003_MESSAGE);
  });

  it("maps listing rows, including seller display name when present", async () => {
    const res = await request(app).get("/api/listings");
    expect(res.status).toBe(200);
    // sellerName is attached only when the seller provided a display name.
    expect(res.body.data[0]).toHaveProperty("sellerName", "Test Seller");
    expect(res.body.data[1]).not.toHaveProperty("sellerName");
    // Money/quantity stay decimal strings (never floats).
    expect(res.body.data[0].pricePerUnit).toBe("18.5");
  });

  it("still rejects a non-whitelisted sortBy with a ValidationError 400 (not P2003)", async () => {
    const res = await request(app).get("/api/listings?sortBy=sellerId");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("ValidationError");
    expect(res.body.error.message).toMatch(/sortBy must be one of/);
    expect(res.body.error.message).not.toMatch(P2003_MESSAGE);
  });
});
