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
    sendError(res, error);
    return;
  }

  // Prisma's known safe errors -> map to HTTP semantics.
  if (error instanceof Error && "code" in error) {
    const prismaCode = (error as { code?: string }).code;
    switch (prismaCode) {
      case "P2002":
        sendError(
          res,
          new ConflictError(
            `A unique constraint would be violated: ${(error as Error).message}`
          )
        );
        return;
      case "P2025":
        sendError(
          res,
          new NotFoundError(
            `The requested resource no longer exists: ${(error as Error).message}`
          )
        );
        return;
      case "P2021":
      case "P2003":
        sendError(
          res,
          new BadRequestError(
            `A foreign key constraint would be violated: ${(error as Error).message}`
          )
        );
        return;
      default:
        break;
    }
  }

  // Fallback for unexpected errors.
  if (process.env.NODE_ENV === "production") {
    sendError(
      res,
      new HttpError(500, "An internal server error occurred")
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

  sendError(res, new HttpError(500, "An internal server error occurred", details));
}

function sendError(res: Response, error: HttpError): void {
  const body: ErrorResponse = {
    error: {
      code: error.name,
      message: error.message,
      details: error.details,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(error.statusCode).json(body);
}

export function badRequestError(message: string, details?: Record<string, unknown>) {
  throw new ValidationError(message, details);
}

export function unauthorizedError(message: string) {
  throw new UnauthorizedError(message);
}

export function forbiddenError(message: string) {
  throw new ForbiddenError(message);
}

export function notFoundError(message: string) {
  throw new NotFoundError(message);
}

export function conflictError(message: string) {
  throw new ConflictError(message);
}
