import { db, parseJson } from "./db";
import type { PartnerForAssign } from "./assign";

const OPEN_DONATION = ["submitted", "reviewing", "needs_info", "approved", "awaiting_handover"];

/** 讀出所有夥伴，轉成分派用的格式 */
export async function loadPartnersForAssign(): Promise<PartnerForAssign[]> {
  const partners = await db.partner.findMany({
    include: {
      depots: true,
      categories: { include: { category: true } },
      _count: { select: { donations: { where: { status: { in: OPEN_DONATION } } } } },
    },
  });
  return partners.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    pickupMode: p.pickupMode,
    serviceAreas: parseJson<string[]>(p.serviceAreas, []),
    priority: p.priority,
    categorySlugs: p.categories.map((c) => c.category.slug),
    openCases: p._count.donations,
    depots: p.depots.map((d) => ({ id: d.id, name: d.name, address: d.address, county: d.county, active: d.active })),
  }));
}

/** 通知某個夥伴的所有人員 */
export async function partnerMemberIds(partnerId: string): Promise<string[]> {
  const m = await db.partnerMember.findMany({ where: { partnerId }, select: { userId: true } });
  return m.map((x) => x.userId);
}

export async function adminIds(): Promise<string[]> {
  const a = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
  return a.map((x) => x.id);
}

/** 這個需求由哪些夥伴負責配送（有分配庫存的集貨點所屬夥伴） */
export async function assignedPartnerIds(needId: string): Promise<string[]> {
  const units = await db.inventoryUnit.findMany({ where: { needItem: { needId } }, select: { depot: { select: { partnerId: true } } } });
  return [...new Set(units.map((u) => u.depot.partnerId))];
}
