// Profile service: get-or-initialize + safe update.
// Identity always comes from the verified Firebase UID, never the body.

import type { PrismaClient } from "@prisma/client";
import { toProfileRecord, type ProfileRecord, type UpdateProfileInput } from "../types/profile";
import { auditLog } from "../auditLog";

export class ProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrInit(firebaseUid: string, email?: string | null): Promise<ProfileRecord> {
    const existing = await this.prisma.profile.findUnique({ where: { firebaseUid } });
    if (existing) return toProfileRecord(existing);
    const created = await this.prisma.profile.create({
      data: { firebaseUid, email: email ?? null, role: "OBSERVER" },
    });
    await auditLog({
      actorId: created.id,
      actorType: "PROFILE",
      entityType: "profile",
      entityId: created.id,
      action: "PROFILE_CREATED",
      prismaClient: this.prisma,
    });
    return toProfileRecord(created);
  }

  async update(firebaseUid: string, input: UpdateProfileInput): Promise<ProfileRecord> {
    const profile = await this.prisma.profile.findUnique({ where: { firebaseUid } });
    if (!profile) {
      // First write for this user (PATCH before GET): create the row with ALL
      // provided fields — never silently drop validated input. Role escalation
      // is still blocked because the route strips `role` for non-admin callers.
      const created = await this.prisma.profile.create({
        data: {
          firebaseUid,
          role: input.role ?? "OBSERVER",
          displayName: input.displayName,
          phone: input.phone,
          avatarUrl: input.avatarUrl,
          city: input.city,
          region: input.region,
          country: input.country,
          latitude: input.latitude,
          longitude: input.longitude,
        },
      });
      await auditLog({
        actorId: created.id,
        actorType: "PROFILE",
        entityType: "profile",
        entityId: created.id,
        action: "PROFILE_CREATED",
        prismaClient: this.prisma,
      });
      return toProfileRecord(created);
    }
    // Non-admins cannot escalate themselves to ADMIN: routes enforce this by
    // stripping role unless the caller is an admin.
    const updated = await this.prisma.profile.update({
      where: { firebaseUid },
      data: {
        ...(input.displayName !== undefined && { displayName: input.displayName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
        ...(input.city !== undefined && { city: input.city }),
        ...(input.region !== undefined && { region: input.region }),
        ...(input.country !== undefined && { country: input.country }),
        ...(input.latitude !== undefined && { latitude: input.latitude }),
        ...(input.longitude !== undefined && { longitude: input.longitude }),
        ...(input.role !== undefined && { role: input.role }),
      },
    });
    await auditLog({
      actorId: profile.id,
      actorType: "PROFILE",
      entityType: "profile",
      entityId: profile.id,
      action: "PROFILE_UPDATED",
      payload: { fields: Object.keys(input) },
      prismaClient: this.prisma,
    });
    return toProfileRecord(updated);
  }
}
