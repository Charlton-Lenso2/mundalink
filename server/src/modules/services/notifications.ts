// Notification service: read + mark-read for the signed-in user, plus a
// best-effort `notify` helper that routes call right after a real domain event.
//
// Design rules:
//   - Notifications are written only in response to REAL events (never on a
//     timer, never fabricated). `notify` is called from the same route handlers
//     that already write the audit log, so the two stay consistent.
//   - `notify` is best-effort: a notification failure must never fail the
//     underlying business operation, so its own errors are swallowed (the audit
//     log remains the system of record for the event itself).
//   - Identity always comes from the verified Firebase UID -> profile id; a
//     caller can only read/mark their OWN notifications.

import type { PrismaClient } from "@prisma/client";
import { toNotificationRecord, type NotificationRecord, type NotificationType } from "../types/notification";
import { forbiddenError, notFoundError } from "../../middleware/error-handler";

export interface NotifyInput {
  recipientId: string;
  entityType: "offer" | "deal";
  entityId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
}

export interface NotificationList {
  items: NotificationRecord[];
  unreadCount: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export class NotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Best-effort write of an event-derived notification. Never throws: a
   * notification is a side-channel, and failing to record one must not roll
   * back or fail the offer/deal action that triggered it.
   */
  static async notify(input: NotifyInput, prismaClient: PrismaClient): Promise<void> {
    try {
      await prismaClient.notification.create({
        data: {
          recipientId: input.recipientId,
          entityType: input.entityType,
          entityId: input.entityId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
        },
      });
    } catch {
      // Swallow: the audit log already records the real event. Notifications are
      // additive UX only and must not break the primary transaction.
    }
  }

  /** Newest-first notifications for the recipient, plus an unread count. */
  async listMine(recipientId: string, limitRaw?: number): Promise<NotificationList> {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(limitRaw ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.notification.count({ where: { recipientId, readAt: null } }),
    ]);

    return { items: rows.map(toNotificationRecord), unreadCount };
  }

  /** Mark a single notification read. Ownership-enforced (recipient only). */
  async markRead(recipientId: string, id: string): Promise<NotificationRecord> {
    const existing = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true, recipientId: true, readAt: true },
    });
    if (!existing) notFoundError(`Notification not found: ${id}`);
    if (existing.recipientId !== recipientId) {
      forbiddenError("You can only update your own notifications");
    }
    // Idempotent: marking an already-read notification read is a no-op that
    // preserves the original readAt.
    if (existing.readAt) {
      const row = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
      return toNotificationRecord(row);
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return toNotificationRecord(updated);
  }

  /** Mark every unread notification for the recipient as read. Returns count. */
  async markAllRead(recipientId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
