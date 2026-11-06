/**
 * 完整流程整合測試（使用 prisma/test.db）：
 * 許願 → 捐贈者認領 → 審核 → 入倉產生 QR → 自動配給許願 → 出貨 → 掃碼收貨 → 發放回報結案 → 定期需求開下一期
 * 另測：部分媒合、婉拒、狀態機擋住跳步、自動分配依截止日。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  allocateToNeed,
  autoAllocate,
  confirmDelivery,
  moveDonation,
  pauseOverdueRecurring,
  receiveIntoDepot,
  reconfirmRecurring,
  reportDistribution,
  shipToNeed,
} from "@/lib/workflow";

let partnerId: string, depotId: string, catId: string;
let donor: { id: string }, staff: { id: string }, pastor: { id: string }, orgId: string;

async function makeNeed(code: string, quantity: number, extra: Record<string, unknown> = {}) {
  return db.need.create({
    data: {
      code, type: "wish", orgId, requesterId: pastor.id, title: `需求 ${code}`, description: "測試",
      status: "published", unitAddress: "花蓮縣卓溪鄉", deliveryAddress: "花蓮縣卓溪鄉", deliveryCounty: "花蓮縣",
      mobile: "0900000000", ...extra,
      items: { create: [{ categoryId: catId, name: "尿布", quantity, unit: "包" }] },
    },
    include: { items: true },
  });
}

async function makeDonation(code: string, quantity: number, needItemId?: string) {
  return db.donation.create({
    data: {
      code, donorId: donor.id, donorType: "individual", contactName: "王", contactPhone: "0900000001",
      logistics: "self_dropoff", depotId, partnerId, status: "submitted", agreedTerms: true,
      items: { create: [{ categoryId: catId, name: "尿布", quantity, unit: "包", needItemId }] },
    },
    include: { items: true },
  });
}

async function approve(id: string) {
  await moveDonation(id, "reviewing", staff);
  await moveDonation(id, "approved", staff);
  await moveDonation(id, "awaiting_handover", staff);
}

beforeAll(async () => {
  const cat = await db.category.create({ data: { slug: "expiring_goods", name: "即期品" } });
  catId = cat.id;
  const p = await db.partner.create({
    data: { slug: "quanan", name: "荃安", contactName: "劉", contactPhone: "0900", depots: { create: [{ name: "八德", address: "桃園市八德區", county: "桃園市" }] } },
    include: { depots: true },
  });
  partnerId = p.id;
  depotId = p.depots[0].id;
  donor = await db.user.create({ data: { goodDeedsId: "t-donor", name: "捐贈者" } });
  staff = await db.user.create({ data: { goodDeedsId: "t-staff", name: "審核員" } });
  await db.partnerMember.create({ data: { partnerId, userId: staff.id, role: "manager" } });
  const org = await db.organization.create({ data: { name: "測試教會", type: "church" } });
  orgId = org.id;
  pastor = await db.user.create({ data: { goodDeedsId: "t-pastor", name: "牧師", orgId } });
});

describe("認領許願的完整流程", () => {
  it("從認領走到結案，定期需求自動開下一期", async () => {
    const need = await makeNeed("N-T-1", 10, { frequency: "monthly" });
    const d = await makeDonation("D-T-1", 10, need.items[0].id);
    await approve(d.id);

    // 入倉 2 箱 → 自動配給認領的許願
    await receiveIntoDepot(d.id, depotId, { [d.items[0].id]: 2 }, staff);
    const units = await db.inventoryUnit.findMany({ where: { donationItemId: d.items[0].id } });
    expect(units).toHaveLength(2);
    expect(units.every((u) => u.status === "allocated" && u.needItemId === need.items[0].id)).toBe(true);
    expect((await db.needItem.findUniqueOrThrow({ where: { id: need.items[0].id } })).fulfilled).toBe(10);
    expect((await db.need.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("matched");
    expect((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("matched");

    // 出貨
    await shipToNeed(need.id, staff);
    expect((await db.need.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("in_transit");
    expect((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("in_transit");

    // 收第一箱：還沒全部到
    await confirmDelivery(units[0].code, pastor, { photoIds: [], onBehalf: false, note: "收到一箱" });
    expect((await db.need.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("in_transit");
    // 同一箱重複掃描不會出錯
    expect((await confirmDelivery(units[0].code, pastor, { photoIds: [], onBehalf: false })).alreadyDelivered).toBe(true);
    // 收第二箱：全部到齊
    await confirmDelivery(units[1].code, pastor, { photoIds: [], onBehalf: false });
    expect((await db.need.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("awaiting_report");
    expect((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("delivered");

    // 發放回報 → 結案、捐贈者結案、下一期公開
    await reportDistribution(need.id, pastor, { householdCount: 12, occasion: "", note: "謝謝", photoIds: [], onBehalf: false });
    expect((await db.need.findUniqueOrThrow({ where: { id: need.id } })).status).toBe("closed");
    expect((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("closed");
    const nextNeed = await db.need.findFirst({ where: { title: need.title, status: "published" }, include: { items: true } });
    expect(nextNeed?.items[0].fulfilled).toBe(0);
    expect(nextNeed?.items[0].quantity).toBe(10);

    // 捐贈者與牧師都有收到好事道通知
    expect(await db.chatMessage.count({ where: { userId: donor.id, threadKey: "donation:D-T-1" } })).toBeGreaterThanOrEqual(6);
    const last = await db.chatMessage.findFirst({ where: { userId: donor.id }, orderBy: { createdAt: "desc" } });
    expect(last?.body).toContain("12 戶");
  });
});

describe("拆單與狀態保護", () => {
  it("自動分配依截止日，數量不足時部分媒合，剩下的留在倉庫", async () => {
    const soon = await makeNeed("N-T-2", 6, { deadline: new Date("2026-12-01") });
    const late = await makeNeed("N-T-3", 20, { deadline: new Date("2027-03-01") });
    const d = await makeDonation("D-T-2", 10);
    await approve(d.id);
    await receiveIntoDepot(d.id, depotId, { [d.items[0].id]: 10 }, staff); // 1 包 1 件

    await autoAllocate(d.items[0].id, staff);
    const s = await db.needItem.findUniqueOrThrow({ where: { id: soon.items[0].id } });
    const l = await db.needItem.findUniqueOrThrow({ where: { id: late.items[0].id } });
    expect(s.fulfilled).toBe(6);
    expect(l.fulfilled).toBe(4);
    expect((await db.need.findUniqueOrThrow({ where: { id: soon.id } })).status).toBe("matched");
    expect((await db.need.findUniqueOrThrow({ where: { id: late.id } })).status).toBe("partially_matched");
    expect((await db.donation.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("matched");
  });

  it("沒有庫存時不能分配；不能跳過審核", async () => {
    const need = await makeNeed("N-T-4", 1);
    const d = await makeDonation("D-T-4", 1);
    await expect(moveDonation(d.id, "approved", staff)).rejects.toThrow();
    await approve(d.id);
    await expect(allocateToNeed(d.items[0].id, need.items[0].id, 1, staff)).rejects.toThrow("沒有庫存");
  });

  it("婉拒會通知捐贈者原因", async () => {
    const d = await makeDonation("D-T-5", 1);
    await moveDonation(d.id, "reviewing", staff);
    await moveDonation(d.id, "rejected", staff, "原因：有效期限不足 3 個月");
    const msg = await db.chatMessage.findFirst({ where: { threadKey: "donation:D-T-5" }, orderBy: { createdAt: "desc" } });
    expect(msg?.body).toContain("有效期限不足");
  });

  it("定期需求逾期暫停，重新確認後恢復", async () => {
    const n = await makeNeed("N-T-6", 5, { frequency: "monthly", nextReviewAt: new Date("2020-01-01") });
    expect(await pauseOverdueRecurring(staff)).toBeGreaterThanOrEqual(1);
    expect((await db.need.findUniqueOrThrow({ where: { id: n.id } })).status).toBe("paused");
    await reconfirmRecurring(n.id, pastor);
    const after = await db.need.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.status).toBe("published");
    expect(after.nextReviewAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
