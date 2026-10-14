// RBAC middleware + helper unit tests (no DB, no HTTP).
//
// Proves: requireRole allows an allowed role and 403s a disallowed one; a
// caller with no profile row is treated as OBSERVER (denied trading roles);
// assertRole throws 403 for a disallowed role; resolveRole reads the DB role
// and defaults a missing profile to OBSERVER.

import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { requireRole, assertRole, resolveRole } from "../src/middleware/rbac";

function fakeClient(role: string | null) {
  return { profile: { findUnique: async () => (role ? { role } : null) } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invoke(mw: any, req: Request): Promise<{ nexted: boolean; error?: { statusCode?: number } }> {
  let nexted = false;
  let error: { statusCode?: number } | undefined;
  const next = (e?: unknown) => {
    nexted = true;
    if (e) error = e as { statusCode?: number };
  };
  try {
    await mw(req, {} as Response, next);
  } catch (e) {
    error = e as { statusCode?: number };
  }
  return { nexted, error };
}

describe("resolveRole", () => {
  it("reads the role from the database", async () => {
    expect(await resolveRole("uid-1", fakeClient("BUYER") as never)).toBe("BUYER");
  });
  it("defaults a missing profile to OBSERVER", async () => {
    expect(await resolveRole("uid-1", fakeClient(null) as never)).toBe("OBSERVER");
  });
});

describe("assertRole", () => {
  it("does not throw for an allowed role", () => {
    expect(() => assertRole("SELLER", "SELLER")).not.toThrow();
  });
  it("throws a 403 for a disallowed role", () => {
    let code = 0;
    try {
      assertRole("OBSERVER", "SELLER");
    } catch (e) {
      code = (e as { statusCode?: number }).statusCode ?? 0;
    }
    expect(code).toBe(403);
  });
});

describe("requireRole middleware", () => {
  it("calls next() when the role is allowed", async () => {
    const req = { firebaseUid: "uid-1", prisma: fakeClient("SELLER") } as unknown as Request;
    const out = await invoke(requireRole("SELLER"), req);
    expect(out.nexted).toBe(true);
    expect(out.error).toBeUndefined();
  });

  it("403s when the role is not allowed", async () => {
    const req = { firebaseUid: "uid-1", prisma: fakeClient("OBSERVER") } as unknown as Request;
    const out = await invoke(requireRole("SELLER"), req);
    expect(out.error?.statusCode).toBe(403);
    expect(out.nexted).toBe(false);
  });

  it("403s when the caller has no profile (treated as OBSERVER)", async () => {
    const req = { firebaseUid: "uid-1", prisma: fakeClient(null) } as unknown as Request;
    const out = await invoke(requireRole("BUYER"), req);
    expect(out.error?.statusCode).toBe(403);
  });
});
