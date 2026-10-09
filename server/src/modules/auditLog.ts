// Audit logging service.
//
// Records important state-changing events with actor, entity, action, and
// timestamp. Deactivated but transacted records are never hard-deleted; audit
// entries are immutable.

import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditEntity = `listing:${string}` | `offer:${string}` | `deal:${string}` | `profile:${string}` | `inventory:${string}`;

export interface AuditOptions {
  actorId?: string;
  actorType?: string;
  entityType: string;
  entityId: string;
  action: string;
  payload?: Record<string, unknown>;
  prismaClient?: PrismaClient;
}

export async function auditLog(options: AuditOptions): Promise<void> {
  const {
    actorId,
    actorType,
    entityType,
    entityId,
    action,
    payload,
    prismaClient,
  } = options;

  const p = prismaClient ?? prisma;

  await p.auditLog.create({
    data: {
      actorId,
      actorType,
      entityType,
      entityId,
      action,
      payload: payload
        ? JSON.stringify(payload)
        : undefined,
    },
  });
}

// Convenience builders -----------------------------------------------------
export function auditListingCreated(
  listingId: string,
  sellerId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId: sellerId,
    actorType: "PROFILE",
    entityType: `listing:${listingId}`,
    entityId: listingId,
    action: "LISTING_CREATED",
    payload: { ...payload, sellerId },
  });
}

export function auditOfferCreated(
  offerId: string,
  listingId: string,
  buyerId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId: buyerId,
    actorType: "PROFILE",
    entityType: `offer:${offerId}`,
    entityId: offerId,
    action: "OFFER_CREATED",
    payload: { listingId, buyerId, ...payload },
  });
}

export function auditOfferAccepted(
  offerId: string,
  listingId: string,
  buyerId: string,
  sellerId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId: sellerId,
    actorType: "PROFILE",
    entityType: `offer:${offerId}`,
    entityId: offerId,
    action: "OFFER_ACCEPTED",
    payload: { listingId, buyerId, ...payload },
  });
}

export function auditOfferDeclined(
  offerId: string,
  listingId: string,
  sellerId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId: sellerId,
    actorType: "PROFILE",
    entityType: `offer:${offerId}`,
    entityId: offerId,
    action: "OFFER_DECLINED",
    payload: { listingId, ...payload },
  });
}

export function auditDealExecuted(
  dealId: string,
  listingId: string,
  buyerId: string,
  sellerId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId: sellerId,
    actorType: "PROFILE",
    entityType: `deal:${dealId}`,
    entityId: dealId,
    action: "DEAL_EXECUTED",
    payload: { listingId, buyerId, ...payload },
  });
}

export function auditDealCancelled(
  dealId: string,
  listingId: string,
  actorId: string,
  payload?: Record<string, unknown>
): Promise<void> {
  return auditLog({
    actorId,
    actorType: "PROFILE",
    entityType: `deal:${dealId}`,
    entityId: dealId,
    action: "DEAL_CANCELLED",
    payload: { listingId, ...payload },
  });
}
