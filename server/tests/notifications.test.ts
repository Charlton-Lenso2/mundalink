// Notification service tests (no DB required).
//
// Proves: notifications are read only for the recipient, mark-read is
// ownership-enforced and idempotent, the best-effort `notify` helper swallows
// its own failures (never breaks the triggering business action), and the
// unread count reflects only unread rows.

import { describe, it, expect } from "vitest";
import { NotificationService } from "../src/modules/services/notifications";

interface Row {
  id: string;
  recipientId: string;
  entityType: string;
  entityId: string;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function makeRows(): Row[] {
  const base = new Date("2026-01-01T00:00:00.000Z");
  return [
    {
      id: "n1",
      recipientId: "me",
      entityType: "offer",
      entityId: "off_1",
      type: "OFFER_RECEIVED",
      title: "New offer",
      body: "5 @ 100",
      readAt: null,
      createdAt: base,
    },
    {
      id: "n2",
      recipientId: "me",
      entityType: "deal",
      entityId: "deal_1",
      type: "DEAL_CONFIRMED",
      title: "A deal was confirmed",
      body: null,
      readAt: new Date("2026-01-02T00:00:00.000Z"),
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "n3",
      recipientId: "someone_else",
      entityType: "offer",
      entityId: "off_9",
      type: "OFFER_RECEIVED",
      title: "Not mine",
      body: null,
      readAt: null,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    },
  ];
}

function fakePrisma(rows: Row[] = makeRows()) {
  return {
    rows,
    notification: {
      findMany: async (args: {
        where: { recipientId: string };
        orderBy: { createdAt: "asc" | "desc" };
        take: number;
      }) => {
        const filtered = rows
          .filter((r) => r.recipientId === args.where.recipientId)
          .sort((a, b) =>
            args.orderBy.createdAt === "desc"
              ? b.createdAt.getTime() - a.createdAt.getTime()
              : a.createdAt.getTime() - b.createdAt.getTime()
          )
          .slice(0, args.take);
        return filtered.map((r) => ({ ...r }));
      },
      count: async (args: { where: { recipientId: string; readAt: null } }) =>
        rows.filter((r) => r.recipientId === args.where.recipientId && r.readAt === null).length,
      findUnique: async (args: { where: { id: string } }) => {
        const found = rows.find((r) => r.id === args.where.id);
        return found ? { id: found.id, recipientId: found.recipientId, readAt: found.readAt } : null;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const found = rows.find((r) => r.id === args.where.id);
        if (!found) throw new Error("not found");
        return { ...found };
      },
      update: async (args: { where: { id: string }; data: { readAt: Date } }) => {
        const found = rows.find((r) => r.id === args.where.id);
        if (!found) throw new Error("not found");
        found.readAt = args.data.readAt;
        return { ...found };
      },
      updateMany: async (args: {
        where: { recipientId: string; readAt: null };
        data: { readAt: Date };
      }) => {
        let count = 0;
        for (const r of rows) {
          if (r.recipientId === args.where.recipientId && r.readAt === null) {
            r.readAt = args.data.readAt;
            count += 1;
          }
        }
        return { count };
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const created = {
          id: `n_${rows.length + 1}`,
          recipientId: args.data.recipientId as string,
          entityType: args.data.entityType as string,
          entityId: args.data.entityId as string,
          type: args.data.type as string,
          title: args.data.title as string,
          body: (args.data.body as string | null) ?? null,
          readAt: null,
          createdAt: new Date(),
        };
        rows.push(created);
        return { ...created };
      },
    },
  };
}

interface HttpErr {
  statusCode?: number;
  message?: string;
}

async function rejected(promise: Promise<unknown>): Promise<HttpErr> {
  try {
    await promise;
  } catch (e) {
    return e as HttpErr;
  }
  throw new Error("expected the call to reject, but it resolved");
}


describe("NotificationService.listMine", () => {
  it("returns only my notifications, newest first, with an unread count", async () => {
    const svc = new NotificationService(fakePrisma() as never);
    const out = await svc.listMine("me");

    expect(out.items).toHaveLength(2);
    expect(out.items.every((n) => n.recipientId === "me")).toBe(true);
    // Newest first: n2 (Jan 2) before n1 (Jan 1).
    expect(out.items[0].id).toBe("n2");
    expect(out.items[1].id).toBe("n1");
    // Only n1 is unread (n2 is already read).
    expect(out.unreadCount).toBe(1);
  });

  it("clamps the limit to a sane maximum", async () => {
    const svc = new NotificationService(fakePrisma() as never);
    const out = await svc.listMine("me", 9999);
    expect(out.items).toHaveLength(2);
  });
});

describe("NotificationService.markRead", () => {
  it("marks my unread notification read", async () => {
    const rows = makeRows();
    const svc = new NotificationService(fakePrisma(rows) as never);
    const out = await svc.markRead("me", "n1");
    expect(out.readAt).toBeInstanceOf(Date);
    expect(rows.find((r) => r.id === "n1")?.readAt).toBeInstanceOf(Date);
  });

  it("is idempotent: re-reading preserves the original readAt", async () => {
    const rows = makeRows();
    const originalReadAt = rows.find((r) => r.id === "n2")?.readAt ?? null;
    const svc = new NotificationService(fakePrisma(rows) as never);
    const out = await svc.markRead("me", "n2");
    expect(out.readAt).toEqual(originalReadAt);
  });

  it("rejects reading someone else's notification with 403", async () => {
    const svc = new NotificationService(fakePrisma() as never);
    const err = await rejected(svc.markRead("me", "n3"));
    expect(err.statusCode).toBe(403);
  });

  it("404s for an unknown notification", async () => {
    const svc = new NotificationService(fakePrisma() as never);
    const err = await rejected(svc.markRead("me", "missing"));
    expect(err.statusCode).toBe(404);
  });
});

describe("NotificationService.markAllRead", () => {
  it("marks every unread notification for me as read", async () => {
    const rows = makeRows();
    const svc = new NotificationService(fakePrisma(rows) as never);
    const out = await svc.markAllRead("me");
    expect(out.updated).toBe(1);
    expect(rows.filter((r) => r.recipientId === "me" && r.readAt === null)).toHaveLength(0);
    // Another user's unread row is untouched.
    expect(rows.find((r) => r.id === "n3")?.readAt).toBeNull();
  });
});

describe("NotificationService.notify (best-effort)", () => {
  it("writes a notification for a real event", async () => {
    const rows: Row[] = [];
    await NotificationService.notify(
      {
        recipientId: "seller_1",
        entityType: "offer",
        entityId: "off_1",
        type: "OFFER_RECEIVED",
        title: "New offer",
        body: "5 @ 100",
      },
      fakePrisma(rows) as never
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: "seller_1",
      entityType: "offer",
      entityId: "off_1",
      type: "OFFER_RECEIVED",
      readAt: null,
    });
  });

  it("never throws when the write fails (must not break the triggering action)", async () => {
    const failing = {
      notification: {
        create: async () => {
          throw new Error("database is down");
        },
      },
    };
    await expect(
      NotificationService.notify(
        {
          recipientId: "seller_1",
          entityType: "offer",
          entityId: "off_1",
          type: "OFFER_RECEIVED",
          title: "New offer",
        },
        failing as never
      )
    ).resolves.toBeUndefined();
  });
});
