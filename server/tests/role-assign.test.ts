// Role-assignment service tests (no DB required).
//
// Covers AdminBootstrapService.assignRole — the operator-driven way to grant
// BUYER/SELLER/ADMIN roles after sign-in. Identity is resolved through Firebase
// (never a client value); the profile must exist; assignment is idempotent and
// audit-logged (ROLE_ASSIGNED); invalid roles/identifiers are rejected.

import { describe, it, expect } from "vitest";
import { AdminBootstrapService, type FirebaseAuthLike } from "../src/modules/services/admin";

function fakeAuth(
  users: Record<string, { uid: string }>,
  byEmail: Record<string, { uid: string }> = {}
): FirebaseAuthLike {
  return {
    getUser: async (uid: string) => {
      const u = users[uid];
      if (!u) throw new Error("user not found");
      return u;
    },
    getUserByEmail: async (email: string) => {
      const u = byEmail[email];
      if (!u) throw new Error("user not found");
      return u;
    },
  };
}

function fakePrisma(profile: { id: string; firebaseUid: string; role: string } | null) {
  let current = profile;
  let updateCalls = 0;
  const audits: Array<{ data: { action: string; entityId: string; payload?: string } }> = [];
  return {
    audits,
    get updateCalls() {
      return updateCalls;
    },
    get currentRole() {
      return current?.role;
    },
    profile: {
      findUnique: async () => (current ? { ...current } : null),
      update: async (args: { where: { id: string }; data: { role: string } }) => {
        updateCalls += 1;
        if (!current || args.where.id !== current.id) throw new Error("profile missing");
        current = { ...current, role: args.data.role };
        return { id: current.id, role: current.role };
      },
    },
    auditLog: {
      create: async (args: { data: { action: string; entityId: string; payload?: string } }) => {
        audits.push(args);
        return args;
      },
    },
  };
}

describe("AdminBootstrapService.assignRole", () => {
  it("assigns BUYER to an OBSERVER and writes a ROLE_ASSIGNED audit entry", async () => {
    const client = fakePrisma({ id: "p1", firebaseUid: "uid-1", role: "OBSERVER" });
    const svc = new AdminBootstrapService(client as never);
    const result = await svc.assignRole(fakeAuth({ "uid-1": { uid: "uid-1" } }), "uid-1", "BUYER");
    expect(result).toEqual({ firebaseUid: "uid-1", profileId: "p1", previousRole: "OBSERVER", role: "BUYER", alreadyRole: false });
    expect(client.currentRole).toBe("BUYER");
    expect(client.audits).toHaveLength(1);
    expect(client.audits[0]?.data.action).toBe("ROLE_ASSIGNED");
  });

  it("assigns SELLER (case-insensitive) and records the previous role", async () => {
    const client = fakePrisma({ id: "p2", firebaseUid: "uid-2", role: "BUYER" });
    const svc = new AdminBootstrapService(client as never);
    const result = await svc.assignRole(fakeAuth({ "uid-2": { uid: "uid-2" } }), "uid-2", "seller");
    expect(result.role).toBe("SELLER");
    expect(result.previousRole).toBe("BUYER");
    expect(client.currentRole).toBe("SELLER");
  });

  it("resolves by email when the identifier contains @", async () => {
    const client = fakePrisma({ id: "p3", firebaseUid: "uid-3", role: "OBSERVER" });
    const svc = new AdminBootstrapService(client as never);
    const result = await svc.assignRole(fakeAuth({}, { "f@example.com": { uid: "uid-3" } }), " f@example.com ", "SELLER");
    expect(result.firebaseUid).toBe("uid-3");
    expect(result.role).toBe("SELLER");
  });

  it("is idempotent: assigning the role the user already holds is a no-op (no audit)", async () => {
    const client = fakePrisma({ id: "p4", firebaseUid: "uid-4", role: "SELLER" });
    const svc = new AdminBootstrapService(client as never);
    const result = await svc.assignRole(fakeAuth({ "uid-4": { uid: "uid-4" } }), "uid-4", "SELLER");
    expect(result.alreadyRole).toBe(true);
    expect(client.updateCalls).toBe(0);
    expect(client.audits).toHaveLength(0);
  });

  it("rejects an invalid role with 400", async () => {
    const client = fakePrisma({ id: "p5", firebaseUid: "uid-5", role: "OBSERVER" });
    const svc = new AdminBootstrapService(client as never);
    await expect(svc.assignRole(fakeAuth({ "uid-5": { uid: "uid-5" } }), "uid-5", "SUPERUSER")).rejects.toMatchObject({ statusCode: 400 });
    expect(client.updateCalls).toBe(0);
  });

  it("rejects an empty identifier with 400", async () => {
    const svc = new AdminBootstrapService(fakePrisma(null) as never);
    await expect(svc.assignRole(fakeAuth({}), "   ", "BUYER")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404s for an identifier that matches no Firebase user", async () => {
    const svc = new AdminBootstrapService(fakePrisma(null) as never);
    await expect(svc.assignRole(fakeAuth({}), "ghost", "BUYER")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404s when the Firebase user has never signed in (no profile row)", async () => {
    const client = fakePrisma(null);
    const svc = new AdminBootstrapService(client as never);
    await expect(svc.assignRole(fakeAuth({ "uid-6": { uid: "uid-6" } }), "uid-6", "BUYER")).rejects.toMatchObject({ statusCode: 404 });
    expect(client.updateCalls).toBe(0);
  });
});
