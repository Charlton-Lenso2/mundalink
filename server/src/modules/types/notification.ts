// Notification domain types.
//
// Notifications are derived ONLY from real domain events (an offer being
// created, an offer being accepted, a deal changing status). There is no
// fabricated or promotional content — every notification points back to the
// entity (Offer or AgreedDeal) that produced it.

export type NotificationEntityType = "offer" | "deal";

// Stable, machine-readable event types. The frontend can key icons/copy off
// these, but the backend always sends a human title/body as well.
export type NotificationType =
  | "OFFER_RECEIVED"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "OFFER_WITHDRAWN"
  | "DEAL_CONFIRMED"
  | "DEAL_COMPLETED"
  | "DEAL_CANCELLED";

export interface NotificationRecord {
  id: string;
  recipientId: string;
  entityType: NotificationEntityType;
  entityId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export function toNotificationRecord(n: {
  id: string;
  recipientId: string;
  entityType: string;
  entityId: string;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: n.id,
    recipientId: n.recipientId,
    entityType: n.entityType as NotificationEntityType,
    entityId: n.entityId,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}
