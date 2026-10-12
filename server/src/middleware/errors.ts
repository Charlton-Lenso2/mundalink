// Centralised HTTP error types.

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request", details?: Record<string, unknown>) {
    super(400, message, details);
    this.name = "BadRequestError";
  }
}

export class ValidationError extends HttpError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required") {
    super(401, message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict") {
    super(409, message);
    this.name = "ConflictError";
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = "Service temporarily unavailable") {
    super(503, message);
    this.name = "ServiceUnavailableError";
  }
}

export class UnprocessableError extends HttpError {
  constructor(message = "Unprocessable entity", details?: Record<string, unknown>) {
    super(422, message, details);
    this.name = "UnprocessableError";
  }
}

