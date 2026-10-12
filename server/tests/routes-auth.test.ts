import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

describe("protected API routes", () => {
  it.each([
    ["GET", "/api/profile/me"],
    ["PATCH", "/api/profile/me"],
    ["POST", "/api/listings"],
    ["PATCH", "/api/listings/listing-id"],
    ["POST", "/api/offers"],
    ["GET", "/api/offers/mine"],
    ["PATCH", "/api/offers/offer-id/status"],
    ["GET", "/api/deals/mine"],
    ["GET", "/api/deals/deal-id/history"],
    ["PATCH", "/api/deals/deal-id/status"],
  ] as const)("rejects unauthenticated %s %s", async (method, path) => {
    const response = await request(app)[method.toLowerCase() as "get" | "post" | "patch"](path);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/authorization/i);
  });
});
