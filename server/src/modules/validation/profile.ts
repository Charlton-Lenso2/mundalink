// Profile update validation: only permitted fields, safe lengths.

import { badRequestError } from "../../middleware/error-handler";
import type { ProfileRole, UpdateProfileInput } from "../types/profile";

const ROLES: ProfileRole[] = ["SELLER", "BUYER", "ADMIN", "OBSERVER"];

export class ProfileValidation {
  static update(input: unknown): UpdateProfileInput {
    if (!input || typeof input !== "object") {
      badRequestError("Request body must be an object");
    }
    const body = input as Record<string, unknown>;
    const result: UpdateProfileInput = {};

    if (body.displayName !== undefined) {
      result.displayName = ProfileValidation.nullableString(body, "displayName", 200);
    }
    if (body.phone !== undefined) {
      result.phone = ProfileValidation.nullableString(body, "phone", 32);
    }
    if (body.avatarUrl !== undefined) {
      result.avatarUrl = ProfileValidation.nullableString(body, "avatarUrl", 2048);
    }
    if (body.city !== undefined) {
      result.city = ProfileValidation.nullableString(body, "city", 128);
    }
    if (body.region !== undefined) {
      result.region = ProfileValidation.nullableString(body, "region", 128);
    }
    if (body.country !== undefined) {
      result.country = ProfileValidation.nullableString(body, "country", 128);
    }
    if (body.latitude !== undefined) {
      result.latitude = ProfileValidation.nullableNumber(body, "latitude");
    }
    if (body.longitude !== undefined) {
      result.longitude = ProfileValidation.nullableNumber(body, "longitude");
    }
    if (body.role !== undefined) {
      if (typeof body.role !== "string" || !ROLES.includes(body.role.toUpperCase() as ProfileRole)) {
        badRequestError("role must be one of SELLER, BUYER, ADMIN, OBSERVER");
      }
      result.role = (body.role as string).toUpperCase() as ProfileRole;
    }
    return result;
  }

  private static nullableString(body: Record<string, unknown>, key: string, max: number): string | null {
    const v = body[key];
    if (v === null) return null;
    if (typeof v !== "string" || v.length > max) {
      badRequestError(`${key} must be a string of <= ${max} characters or null`);
    }
    return v as string;
  }

  private static nullableNumber(body: Record<string, unknown>, key: string): number | null {
    const v = body[key];
    if (v === null) return null;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      badRequestError(`${key} must be a finite number or null`);
    }
    return v as number;
  }
}
