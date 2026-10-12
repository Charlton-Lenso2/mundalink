// Analytics service: platform aggregates computed from REAL stored data.
//
// No fabricated or mock numbers — every figure is aggregated from the database
// at request time. Deal value is summed with Decimal (never floats) and kept
// per currency, since listings may declare different currencies.

import { Decimal } from "decimal.js";
import type { PrismaClient } from "@prisma/client";

export interface AnalyticsSummary {
  listings: { byStatus: Record<string, number> };
  offers: { byStatus: Record<string, number> };
  deals: { byStatus: Record<string, number>; agreedValueByCurrency: Record<string, string> };
  profiles: { total: number; byRole: Record<string, number> };
  generatedAt: string;
}

export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(): Promise<AnalyticsSummary> {
    const [listingCounts, offerCounts, dealCounts, dealRows, profileTotal, profileRoleCounts] =
      await Promise.all([
        this.prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.offer.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.agreedDeal.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.agreedDeal.findMany({
          select: {
            agreedQuantity: true,
            agreedPrice: true,
            listing: { select: { currency: true } },
          },
        }),
        this.prisma.profile.count(),
        this.prisma.profile.groupBy({ by: ["role"], _count: { _all: true } }),
      ]);

    // Agreed value per currency: quantity x price summed with Decimal precision.
    const valueByCurrency = new Map<string, Decimal>();
    for (const row of dealRows) {
      const currency = row.listing.currency || "USD";
      const value = new Decimal(String(row.agreedQuantity)).mul(new Decimal(String(row.agreedPrice)));
      valueByCurrency.set(currency, (valueByCurrency.get(currency) ?? new Decimal(0)).plus(value));
    }

    return {
      listings: { byStatus: countByKey(listingCounts, (r) => r.status) },
      offers: { byStatus: countByKey(offerCounts, (r) => r.status) },
      deals: {
        byStatus: countByKey(dealCounts, (r) => r.status),
        agreedValueByCurrency: Object.fromEntries(
          [...valueByCurrency.entries()].map(([currency, value]) => [currency, value.toFixed(6)])
        ),
      },
      profiles: {
        total: profileTotal,
        byRole: countByKey(profileRoleCounts, (r) => r.role),
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

function countByKey<T extends { _count: { _all: number } }>(
  rows: T[],
  keyOf: (row: T) => string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    out[keyOf(row)] = row._count._all;
  }
  return out;
}
