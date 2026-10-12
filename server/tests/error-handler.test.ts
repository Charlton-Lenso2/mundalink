// Error-handling middleware unit tests (no DB required).
//
// Prisma error codes must map to the right HTTP status: a missing table
// (P2021) is a server-side misconfiguration and has to surface as 503, not
// as a client error.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { errorHandler } from "../src/middleware/error-handler";
import { NotFoundError } from "../src/middleware/errors";

interface FakeResponse {
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeRes(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const testReq = {
  requestId: "test-request",
  path: "/api/listings",
  method: "GET",
} as unknown as Request;

function prismaError(code: string): Error & { code: string } {
  const error = new Error(`Prisma error ${code}`) as Error & { code: string };
  error.code = code;
  return error;
}

function run(error: unknown): { status: number; code: string; message: string } {
  const res = fakeRes();
  errorHandler(error, testReq, res as unknown as Response, vi.fn() as unknown as NextFunction);
  const body = res.body as { error?: { code?: string; message?: string } };
  return {
    status: res.statusCode,
    code: body.error?.code ?? "",
    message: body.error?.message ?? "",
  };
}

describe("errorHandler Prisma code mapping", () => {
  let consoleSpy: { mockRestore(): void };

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("maps P2021 (missing table) to 503", () => {
    const out = run(prismaError("P2021"));
    expect(out.status).toBe(503);
    expect(out.code).toBe("ServiceUnavailableError");
    expect(out.message).toMatch(/unavailable/i);
  });

  it("maps P2003 (missing related record) to 400", () => {
    const out = run(prismaError("P2003"));
    expect(out.status).toBe(400);
    expect(out.code).toBe("BadRequestError");
  });

  it("maps P2002 (unique violation) to 409", () => {
    const out = run(prismaError("P2002"));
    expect(out.status).toBe(409);
    expect(out.code).toBe("ConflictError");
  });

  it("maps P2025 (record not found) to 404", () => {
    const out = run(prismaError("P2025"));
    expect(out.status).toBe(404);
    expect(out.code).toBe("NotFoundError");
  });

  it("passes normalised HttpError instances through unchanged", () => {
    const out = run(new NotFoundError("Listing not found"));
    expect(out.status).toBe(404);
    expect(out.message).toBe("Listing not found");
  });

  it("falls back to 500 for unknown errors", () => {
    const out = run(new Error("unexpected"));
    expect(out.status).toBe(500);
  });
});