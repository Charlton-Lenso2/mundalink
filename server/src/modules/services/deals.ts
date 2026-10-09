// Deal query service: deals involving the user as buyer or seller.

import type { PrismaClient } from "@prisma/client";
import { toDealRecord, type DealRecord } from "../types/deal";

export class DealService {
  constructor(private readonly prisma: PrismaClient) {}

  async findMine(profileId: string): Promise<DealRecord[]> {
    const rows = await this.prisma.agreedDeal.findMany({
      where: { OR: [{ buyerId: profileId }, { sellerId: profileId }] },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDealRecord);
  }
}
