// Centralised Express error-handling middleware.
//
// Catches all downstream errors, normalises them to a stable JSON shape, never
// leaks stack traces or secrets, and guarantees a JSON response for errors.

import type { Request, Response, NextFunction } from "express";
import {
  HttpError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BadRequestError,
  ServiceUnavailableError,
} from "./errors";

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    path?: string;
    method?: string;
  };
  timestamp: string;
  requestId?: string;
}

/**
 * Attach a requestId so operators can trace a request through logs without
 * exposing user-identifying data in the response.
 */
export function requestIdMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  req.requestId =
    (req.headers["x-request-id"] as string | undefined) ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const error = err as any;

  // Already a normalised HTTP error -> use its semantics.
  if (error instanceof HttpError) {
    sendError(res, error, req);
    return;
  }

  // Prisma's known safe errors -> map to HTTP semantics.
  // NB: raw driver messages can contain constraint/table fragments, so we
  // return generic messages and log the raw error server-side only.
  if (error instanceof Error && "code" in error) {
    const prismaCode = (error as { code?: string }).code;
    // eslint-disable-next-line no-console
    console.error(`[prisma] ${String(prismaCode)}: ${(error as Error).message}`);
    switch (prismaCode) {
      case "P2002":
        sendError(
          res,
          new ConflictError("A unique constraint would be violated"),
          req
        );
        return;
      case "P2025":
        sendError(
          res,
          new NotFoundError("The requested resource no longer exists"),
          req
        );
        return;
      case "P2021":
        sendError(
          res,
          new ServiceUnavailableError("The database schema is unavailable. Contact the platform administrator."),
          req
        );
        return;
      case "P2003":
        sendError(
          res,
          new BadRequestError("A related record is missing or invalid"),
          req
        );
        return;
      case "P1001":
      case "P1008":
      case "P1017":
        // Connectivity/timeout problems are transient infrastructure issues:
        // tell clients to retry instead of reporting an internal server bug.
        sendError(
          res,
          new ServiceUnavailableError(
            "The database is temporarily unreachable. Please retry shortly."
          ),
          req
        );
        return;
      default:
        break;
    }
  }

  // Prisma client could not initialise (e.g. the DB was unreachable when the
  // query started). Belt-and-braces: also 503 even if no code is attached.
  if (
    error instanceof Error &&
    (error.name === "PrismaClientInitializationError" ||
      error.message.startsWith("Can't reach database server"))
  ) {
    // eslint-disable-next-line no-console
    console.error(`[prisma] init: ${error.message}`);
    sendError(
      res,
      new ServiceUnavailableError(
        "The database is temporarily unreachable. Please retry shortly."
      ),
      req
    );
    return;
  }

  // Fallback for unexpected errors.
  // eslint-disable-next-line no-console
  console.error(`[unhandled] ${err instanceof Error ? err.message : String(err)}`);
  if (process.env.NODE_ENV === "production") {
    sendError(
      res,
      new HttpError(500, "An internal server error occurred"),
      req
    );
    return;
  }

  // Development-only: surface the original error shape, but never a raw stack
  // trace or a private key / credential value.
  const details =
    error instanceof Error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : undefined;

  sendError(res, new HttpError(500, "An internal server error occurred", details), req);
}

function sendError(res: Response, error: HttpError, req?: Request): void {
  const body: ErrorResponse = {
    error: {
      code: error.name,
      message: error.message,
      details: error.details,
      path: req?.path,
      method: req?.method,
    },
    timestamp: new Date().toISOString(),
    requestId: req?.requestId,
  };

  res.status(error.statusCode).json(body);
}

export function badRequestError(message: string, details?: Record<string, unknown>): never {
  throw new ValidationError(message, details);
}

export function unauthorizedError(message: string): never {
  throw new UnauthorizedError(message);
}

export function forbiddenError(message: string): never {
  throw new ForbiddenError(message);
}

export function notFoundError(message: string): never {
  throw new NotFoundError(message);
}

export function conflictError(message: string): never {
  throw new ConflictError(message);
}
