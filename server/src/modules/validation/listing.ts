// Listing input validation rules.
//
// Validation rules:
//   - title: required, 3..200 chars
//   - description: optional, max 10_000 chars
//   - category/commodity: optional, max 128 chars
//   - quantity: > 0, Decimal
//   - pricePerUnit: >= 0, Decimal
//   - currency: 3 uppercase letters (default USD)
//   - unit: optional, max 32 chars
//   - availableQuantity: >= 0, Decimal
//
// Listing status transitions:
//   DRAFT -> ACTIVE (publish)
//   DRAFT | ACTIVE -> REJECTED (seller rejects their own listing)
//   ACTIVE | REJECTED -> DRAFT (draft is reusable)

import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";
import { validateStoredDecimal } from "./numeric";

export class ListingValidation {
  static create(input: unknown): import("../types/listing").CreateListingInput {
    if (!input || typeof input !== "object") {
      throw badRequestError("Request body must be an object");
    }
    const body = input as Record<string, unknown>;

    const title = this.nonEmptyString(body, "title", 3, 200);
    const description = this.optionalText(body, "description", 10_000);
    const category = this.optionalString(body, "category", 128);
    const commodity = this.optionalString(body, "commodity", 128);
    const unit = this.optionalString(body, "unit", 32);

    const quantity = this.positiveDecimal(body, "quantity");
    const pricePerUnit = this.nonNegativeDecimal(body, "pricePerUnit");

    const currency = (body.currency as string | undefined)?.toUpperCase() ?? "USD";
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw badRequestError("currency must be 3 uppercase letters");
    }

    const location = this.optionalString(body, "location", 255);
    const latitude = this.optionalNumber(body, "latitude");
    const longitude = this.optionalNumber(body, "longitude");
    const availableQuantity = this.nonNegativeDecimal(body, "availableQuantity");
    validateStoredDecimal(quantity, "quantity");
    validateStoredDecimal(pricePerUnit, "pricePerUnit");
    validateStoredDecimal(availableQuantity, "availableQuantity");
    if (availableQuantity.gt(quantity)) {
      badRequestError("availableQuantity cannot exceed quantity");
    }

    return {
      sellerId: body.sellerId as string,
      title,
      description,
      category,
      commodity,
      quantity,
      unit,
      pricePerUnit,
      currency,
      location,
      latitude,
      longitude,
      availableQuantity,
    };
  }

  static update(input: unknown): import("../types/listing").UpdateListingInput {
    if (!input || typeof input !== "object") {
      throw badRequestError("Request body must be an object");
    }
    const body = input as Record<string, unknown>;
    const result: import("../types/listing").UpdateListingInput = {};

    if (typeof body.title === "string") {
      if (body.title.length < 3 || body.title.length > 200) {
        throw badRequestError("title must be 3..200 characters");
      }
      result.title = body.title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 10_000) {
        throw badRequestError("description must be <= 10_000 characters");
      }
      result.description = body.description;
    }
    if (typeof body.category === "string") result.category = body.category;
    if (typeof body.commodity === "string") result.commodity = body.commodity;
    if (typeof body.unit === "string") result.unit = body.unit;
    if (body.pricePerUnit !== undefined) {
      result.pricePerUnit = validateStoredDecimal(this.nonNegativeDecimal(
        { pricePerUnit: body.pricePerUnit },
        "pricePerUnit"
      ), "pricePerUnit");
    }
    if (body.quantity !== undefined) {
      result.quantity = validateStoredDecimal(this.positiveDecimal({ quantity: body.quantity }, "quantity"), "quantity");
    }
    if (typeof body.currency === "string") {
      const c = body.currency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(c)) throw badRequestError("currency must be 3 uppercase letters");
      result.currency = c;
    }
    if (typeof body.location === "string") result.location = body.location;
    if (typeof body.latitude === "number") result.latitude = body.latitude;
    if (typeof body.longitude === "number") result.longitude = body.longitude;
    if (body.availableQuantity !== undefined) {
      result.availableQuantity = validateStoredDecimal(this.nonNegativeDecimal(
        { availableQuantity: body.availableQuantity },
        "availableQuantity"
      ), "availableQuantity");
    }
    if (typeof body.status === "string") {
      const status = body.status.toUpperCase();
      if (!["DRAFT", "ACTIVE", "REJECTED", "SOLD"].includes(status)) {
        throw badRequestError("invalid listing status");
      }
      result.status = status as import("../types/listing").ListingStatus;
    }
    return result;
  }

  private static nonEmptyString(
    body: Record<string, unknown>,
    key: string,
    min: number,
    max: number
  ): string {
    const value = body[key];
    if (typeof value !== "string" || value.length < min || value.length > max) {
      throw badRequestError(`${key} must be a string of ${min}..${max} characters`);
    }
    return value;
  }

  private static optionalText(body: Record<string, unknown>, key: string, max: number): string | null {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > max) {
      throw badRequestError(`${key} must be a string of <= ${max} characters`);
    }
    return value;
  }

  private static optionalString(body: Record<string, unknown>, key: string, max: number): string | null {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== "string" || value.length > max) {
      throw badRequestError(`${key} must be a string of <= ${max} characters`);
    }
    return value;
  }

  private static positiveDecimal(body: Record<string, unknown>, key: string): Decimal {
    const value = body[key];
    if (value === undefined || value === null) {
      badRequestError(`${key} is required and must be a positive decimal`);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = new Decimal(value);
      if (parsed.lte(0)) {
        badRequestError(`${key} must be greater than zero`);
      }
      return parsed;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      let parsed: Decimal;
      try {
        parsed = new Decimal(trimmed);
      } catch {
        badRequestError(`${key} must be a positive decimal number`);
      }
      if ((parsed as Decimal).lte(0)) {
        badRequestError(`${key} must be greater than zero`);
      }
      return parsed as Decimal;
    }
    badRequestError(`${key} must be a positive decimal number`);
  }

  private static nonNegativeDecimal(body: Record<string, unknown>, key: string): Decimal {
    const value = body[key];
    if (value === undefined || value === null) {
      throw badRequestError(`${key} is required and must be a non-negative decimal`);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = new Decimal(value);
      if (parsed.lt(0)) {
        throw badRequestError(`${key} must be a non-negative decimal number`);
      }
      return parsed;
    }
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())) {
      return new Decimal(value.trim());
    }
    throw badRequestError(`${key} must be a non-negative decimal number`);
  }

  private static optionalNumber(body: Record<string, unknown>, key: string): number | null {
    const value = body[key];
    if (value === undefined || value === null) return null;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw badRequestError(`${key} must be a number`);
  }
}
