// First-admin bootstrap tests: secure, audited, idempotent ADMIN promotion.
//
// There is no HTTP path to ADMIN — this service backs the operator CLI
// (`npm run admin:promote`). Identity always resolves through the Firebase
// Admin SDK (uid or email), never a request body.

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

describe("AdminBootstrapService.promoteAdmin", () => {
  it("promotes an OBSERVER to ADMIN and writes an ADMIN_PROMOTED audit entry", async () => {
    const client = fakePrisma({ id: "p1", firebaseUid: "uid-1", role: "OBSERVER" });
    const svc = new AdminBootstrapService(client as never);

    const result = await svc.promoteAdmin(fakeAuth({ "uid-1": { uid: "uid-1" } }), "uid-1");

    expect(result).toEqual({
      firebaseUid: "uid-1",
      profileId: "p1",
      previousRole: "OBSERVER",
      role: "ADMIN",
      alreadyAdmin: false,
    });
    expect(client.currentRole).toBe("ADMIN");
    expect(client.audits).toHaveLength(1);
    expect(client.audits[0]?.data.action).toBe("ADMIN_PROMOTED");
    expect(client.audits[0]?.data.entityId).toBe("p1");
  });

  it("resolves by email when the identifier contains @", async () => {
    const client = fakePrisma({ id: "p2", firebaseUid: "uid-2", role: "BUYER" });
    const svc = new AdminBootstrapService(client as never);
    const auth = fakeAuth({}, { "farmer@example.com": { uid: "uid-2" } });

    const result = await svc.promoteAdmin(auth, " farmer@example.com ");

    expect(result.firebaseUid).toBe("uid-2");
    expect(result.role).toBe("ADMIN");
    expect(client.currentRole).toBe("ADMIN");
  });

  it("is idempotent: promoting an existing ADMIN is a no-op without audit noise", async () => {
    const client = fakePrisma({ id: "p3", firebaseUid: "uid-3", role: "ADMIN" });
    const svc = new AdminBootstrapService(client as never);

    const result = await svc.promoteAdmin(fakeAuth({ "uid-3": { uid: "uid-3" } }), "uid-3");

    expect(result.alreadyAdmin).toBe(true);
    expect(client.updateCalls).toBe(0);
    expect(client.audits).toHaveLength(0);
  });

  it("rejects an identifier that matches no Firebase user with 404", async () => {
    const client = fakePrisma(null);
    const svc = new AdminBootstrapService(client as never);

    await expect(svc.promoteAdmin(fakeAuth({}), "ghost-uid")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects a Firebase user who has never signed in (no profile row) with 404", async () => {
    const client = fakePrisma(null);
    const svc = new AdminBootstrapService(client as never);

    await expect(
      svc.promoteAdmin(fakeAuth({ "uid-4": { uid: "uid-4" } }), "uid-4")
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(client.updateCalls).toBe(0);
  });

  it("rejects an empty identifier with 400", async () => {
    const client = fakePrisma(null);
    const svc = new AdminBootstrapService(client as never);

    await expect(svc.promoteAdmin(fakeAuth({}), "   ")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
