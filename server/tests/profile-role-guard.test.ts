// Profile role-escalation guard (no DB; Firebase + Prisma mocked).
//
// Proves ADMIN role management is protected at the HTTP boundary:
//   - A non-admin PATCHing /api/profile/me with a `role` has it STRIPPED — no
//     self-promotion to ADMIN/SELLER/BUYER is possible via the API.
//   - An ADMIN PATCHing /api/profile/me with a `role` may change it (the only
//     sanctioned in-app path; the CLI remains for first-admin bootstrap).
// The profile.update payload is captured so we can assert whether `role` was
// actually written.

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const state = vi.hoisted(() => ({
  role: "OBSERVER" as string,
  updatePayload: null as Record<string, unknown> | null,
}));

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

vi.mock("../src/modules/prisma", () => ({
  prisma: {
    profile: {
      findUnique: async () => ({ id: "profile-1", firebaseUid: "uid-1", role: state.role, email: "u@example.com", displayName: null, phone: null, avatarUrl: null, city: null, region: null, country: "Zimbabwe", latitude: null, longitude: null, createdAt: new Date(), updatedAt: new Date() }),
      update: async (args: { where: { firebaseUid: string }; data: Record<string, unknown> }) => {
        state.updatePayload = args.data;
        // Reflect any role change so a follow-up read is consistent.
        if (typeof args.data.role === "string") state.role = args.data.role;
        return { id: "profile-1", firebaseUid: "uid-1", role: state.role, displayName: (args.data.displayName as string) ?? null, email: "u@example.com", phone: null, avatarUrl: null, city: null, region: null, country: "Zimbabwe", latitude: null, longitude: null, createdAt: new Date(), updatedAt: new Date() };
      },
      create: async () => ({ id: "profile-1", firebaseUid: "uid-1", role: state.role }),
    },
    auditLog: { create: async () => ({}) },
  },
}));

import { createApp } from "../src/app";

const app = createApp();
const AUTH = { Authorization: "Bearer valid" };

beforeEach(() => {
  state.role = "OBSERVER";
  state.updatePayload = null;
});

describe("PATCH /api/profile/me role escalation guard", () => {
  it("strips `role` for a non-admin (no self-promotion)", async () => {
    const res = await request(app)
      .patch("/api/profile/me")
      .set(AUTH)
      .send({ displayName: "Alice", role: "ADMIN" });
    expect(res.status).toBe(200);
    // The stored update must NOT contain role.
    expect(state.updatePayload).not.toBeNull();
    expect(Object.keys(state.updatePayload as Record<string, unknown>)).not.toContain("role");
    // Response role is unchanged.
    expect(res.body.data.role).toBe("OBSERVER");
  });

  it("allows an ADMIN to assign a role", async () => {
    state.role = "ADMIN";
    const res = await request(app)
      .patch("/api/profile/me")
      .set(AUTH)
      .send({ role: "SELLER" });
    expect(res.status).toBe(200);
    expect(state.updatePayload).toMatchObject({ role: "SELLER" });
    expect(res.body.data.role).toBe("SELLER");
  });

  it("requires authentication (401 without a token)", async () => {
    const res = await request(app).patch("/api/profile/me").send({ role: "ADMIN" });
    expect(res.status).toBe(401);
  });
});
