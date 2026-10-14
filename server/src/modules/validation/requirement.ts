// Requirement request-body validation.
//
// Quantities/prices follow the existing NUMERIC(20,6) conventions (see
// validation/numeric.ts). Units are non-empty free text (max 32) and combine
// only on exact match — no conversion. Dates must be valid ISO strings.
// Ownership and status are NEVER accepted from the body (routes set buyerId from
// the verified token; status changes are server-driven).

import { Decimal } from "decimal.js";
import { badRequestError } from "../../middleware/error-handler";
import { validateStoredDecimal } from "./numeric";
import type { CreateRequirementInput, UpdateRequirementInput } from "../types/requirement";

export class RequirementValidation {
  static create(input: unknown): CreateRequirementInput {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;

    const title = nonEmptyString(body, "title", 3, 200);
    const description = optionalText(body, "description", 10_000);
    const qualityNotes = optionalText(body, "qualityNotes", 2_000);
    const category = optionalString(body, "category", 128);
    const commodity = optionalString(body, "commodity", 128);
    const unit = nonEmptyString(body, "unit", 1, 32);

    const quantity = validateStoredDecimal(positiveDecimal(body, "quantity"), "quantity");

    const location = optionalString(body, "location", 255);
    const neededBy = optionalDate(body, "neededBy");

    let targetPrice: Decimal | null = null;
    if (body.targetPrice !== undefined && body.targetPrice !== null) {
      targetPrice = validateStoredDecimal(nonNegativeDecimal(body, "targetPrice"), "targetPrice");
    }

    const currency = (typeof body.currency === "string" ? body.currency.toUpperCase() : "USD");
    if (!/^[A-Z]{3}$/.test(currency)) badRequestError("currency must be 3 uppercase letters");

    return {
      buyerId: "",
      title,
      description,
      qualityNotes,
      category,
      commodity,
      quantity,
      unit,
      location,
      neededBy,
      targetPrice,
      currency,
    };
  }

  static update(input: unknown): UpdateRequirementInput {
    if (!input || typeof input !== "object") badRequestError("Request body must be an object");
    const body = input as Record<string, unknown>;
    const result: UpdateRequirementInput = {};

    if (typeof body.title === "string") {
      if (body.title.length < 3 || body.title.length > 200) badRequestError("title must be 3..200 characters");
      result.title = body.title;
    }
    if (typeof body.description === "string") {
      if (body.description.length > 10_000) badRequestError("description must be <= 10000 characters");
      result.description = body.description;
    }
    if (typeof body.qualityNotes === "string") {
      if (body.qualityNotes.length > 2_000) badRequestError("qualityNotes must be <= 2000 characters");
      result.qualityNotes = body.qualityNotes;
    }
    if (typeof body.category === "string") result.category = body.category;
    if (typeof body.commodity === "string") result.commodity = body.commodity;
    if (typeof body.location === "string") result.location = body.location;
    if (typeof body.unit === "string") {
      if (body.unit.length < 1 || body.unit.length > 32) badRequestError("unit must be 1..32 characters");
      result.unit = body.unit;
    }
    if (typeof body.quantity === "string" || typeof body.quantity === "number") {
      result.quantity = validateStoredDecimal(positiveDecimal(body, "quantity"), "quantity");
    }
    if (typeof body.targetPrice === "string" || typeof body.targetPrice === "number") {
      result.targetPrice = validateStoredDecimal(nonNegativeDecimal(body, "targetPrice"), "targetPrice");
    }
    if (body.neededBy !== undefined) {
      result.neededBy = optionalDate(body, "neededBy");
    }
    if (typeof body.currency === "string") {
      const currency = body.currency.toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) badRequestError("currency must be 3 uppercase letters");
      result.currency = currency;
    }
    return result;
  }
}

function nonEmptyString(body: Record<string, unknown>, key: string, min: number, max: number): string {
  const v = body[key];
  if (typeof v !== "string" || v.length < min || v.length > max) {
    badRequestError(`${key} must be a string of ${min}..${max} characters`);
  }
  return v as string;
}

function optionalString(body: Record<string, unknown>, key: string, max: number): string | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.length > max) badRequestError(`${key} must be a string of <= ${max} characters`);
  return v as string;
}

function optionalText(body: Record<string, unknown>, key: string, max: number): string | null {
  return optionalString(body, key, max);
}

function positiveDecimal(body: Record<string, unknown>, key: string): Decimal {
  const v = body[key];
  try {
    const d = new Decimal(String(v));
    if (!d.isFinite() || d.lte(0)) badRequestError(`${key} must be greater than zero`);
    return d;
  } catch {
    badRequestError(`${key} must be a positive decimal number`);
  }
}

function nonNegativeDecimal(body: Record<string, unknown>, key: string): Decimal {
  const v = body[key];
  try {
    const d = new Decimal(String(v));
    if (!d.isFinite() || d.lt(0)) badRequestError(`${key} must be a non-negative decimal number`);
    return d;
  } catch {
    badRequestError(`${key} must be a non-negative decimal number`);
  }
}

function optionalDate(body: Record<string, unknown>, key: string): Date | null {
  const v = body[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" && typeof v !== "number") badRequestError(`${key} must be an ISO date string`);
  const parsed = new Date(v as string | number);
  if (Number.isNaN(parsed.getTime())) badRequestError(`${key} must be a valid date`);
  return parsed;
}
