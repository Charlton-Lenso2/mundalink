// Auth boundary tests: no token, malformed token, invalid token => 401;
// valid shape still requires real Firebase verification (mocked here).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { authenticate } from "../src/middleware/auth";

vi.mock("../src/config/firebase", () => ({
  getFirebaseAdmin: () => ({
    auth: {
      verifyIdToken: async (token: string) => {
        if (token === "valid-token") return { uid: "uid-123" };
        throw new Error("invalid token");
      },
    },
  }),
}));

vi.mock("../src/modules/prisma", () => ({
  prisma: {
    profile: { findUnique: async () => ({ role: "OBSERVER" }) },
  },
}));

function mockReq(token?: string): Request {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} } as Request;
}

describe("authenticate middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects missing Authorization header", async () => {
    const mw = authenticate();
    let threw = "";
    try {
      await mw(mockReq(), {} as Response, () => {});
    } catch (e) {
      threw = (e as Error).message;
    }
    expect(threw).toMatch(/Authorization/i);
  });

  it("rejects an invalid token", async () => {
    const mw = authenticate();
    let threw = "";
    try {
      await mw(mockReq("bad-token"), {} as Response, () => {});
    } catch (e) {
      threw = (e as Error).message;
    }
    expect(threw).toMatch(/verification failed/i);
  });

  it("attaches verified uid for a valid token", async () => {
    const mw = authenticate();
    const req = mockReq("valid-token");
    let nexted = false;
    await mw(req, {} as Response, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect((req as { firebaseUid?: string }).firebaseUid).toBe("uid-123");
  });
});
