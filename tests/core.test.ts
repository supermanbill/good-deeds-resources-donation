import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, needStatusFromFulfillment } from "@/lib/status";
import { validateItem, type ItemInput } from "@/lib/categories";
import { assignPickupPartner, countyFromAddress, depotOptions, type PartnerForAssign } from "@/lib/assign";
import { canSeeContact, maskPhone, needsPhoneFallback, publicArea } from "@/lib/privacy";
import { allocate } from "@/lib/match";
import { donationCode, inventoryCode } from "@/lib/codes";

describe("狀態機", () => {
  it("允許正常流程", () => {
    expect(canTransition("donation", "submitted", "reviewing")).toBe(true);
    expect(canTransition("donation", "reviewing", "rejected")).toBe(true);
    expect(canTransition("donation", "awaiting_handover", "in_transit")).toBe(true);
  });
  it("禁止跳步與倒退", () => {
    expect(canTransition("donation", "submitted", "approved")).toBe(false);
    expect(canTransition("donation", "rejected", "approved")).toBe(false);
    expect(() => assertTransition("need", "closed", "published")).toThrow();
  });
  it("依數量判斷部分媒合", () => {
    expect(needStatusFromFulfillment([{ quantity: 10, fulfilled: 0 }])).toBeNull();
    expect(needStatusFromFulfillment([{ quantity: 10, fulfilled: 4 }])).toBe("partially_matched");
    expect(needStatusFromFulfillment([{ quantity: 10, fulfilled: 12 }])).toBe("matched");
  });
});

const base: ItemInput = { name: "泡麵", quantity: 10, unit: "箱", confirmations: {}, photoCount: 2 };
const today = new Date("2026-11-06T00:00:00+08:00");

describe("品類規則", () => {
  it("即期品要常溫、效期 90 天以上", () => {
    const short = validateItem("expiring_goods", { ...base, expiryDate: "2026-12-01", confirmations: { ambient: true } }, today);
    expect(short.join()).toContain("90 天");
    const noAmbient = validateItem("expiring_goods", { ...base, expiryDate: "2027-06-01" }, today);
    expect(noAmbient.join()).toContain("常溫");
    expect(validateItem("expiring_goods", { ...base, expiryDate: "2027-06-01", confirmations: { ambient: true } }, today)).toEqual([]);
  });
  it("家電要確認可運作、填使用年限", () => {
    const e = validateItem("appliance", { ...base, name: "電鍋" }, today);
    expect(e.join()).toContain("正常運作");
    expect(e.join()).toContain("使用年限");
  });
  it("傢俱至少 2 張照片", () => {
    const e = validateItem("furniture", { ...base, name: "書桌", photoCount: 1, usageYears: "3 年", confirmations: { sturdy: true } }, today);
    expect(e.join()).toContain("2 張");
  });
  it("全新禮物不收月曆", () => {
    const e = validateItem("new_gift", { ...base, name: "2027 月曆", photoCount: 1, confirmations: { sealed: true } }, today);
    expect(e.join()).toContain("月曆");
  });
});

const partner = (o: Partial<PartnerForAssign>): PartnerForAssign => ({
  id: "p", name: "p", active: true, pickupMode: "outsourced", serviceAreas: ["台北市", "新北市"],
  priority: 100, categorySlugs: ["furniture", "appliance"], openCases: 0,
  depots: [{ id: "d", name: "八德倉", address: "桃園市八德區", county: "桃園市", active: true }], ...o,
});

describe("夥伴分派", () => {
  it("從地址抓縣市，臺／台都可以", () => {
    expect(countyFromAddress("臺北市大安區和平東路")).toBe("台北市");
    expect(countyFromAddress("954台東縣卑南鄉")).toBe("台東縣");
  });
  it("到府收貨依範圍、品類、優先序、案件量", () => {
    const a = partner({ id: "a", priority: 1, openCases: 9 });
    const b = partner({ id: "b", priority: 1, openCases: 2 });
    const c = partner({ id: "c", priority: 0, serviceAreas: ["花蓮縣"] });
    expect(assignPickupPartner([a, b, c], ["furniture"], "臺北市")?.id).toBe("b");
    expect(assignPickupPartner([a, b, c], ["apparel"], "台北市")).toBeNull();
    expect(assignPickupPartner([partner({ pickupMode: "none" })], ["furniture"], "台北市")).toBeNull();
  });
  it("自行送達列出所有可收的集貨點", () => {
    const opts = depotOptions([partner({ id: "a" }), partner({ id: "x", categorySlugs: ["apparel"] })], ["furniture"]);
    expect(opts.map((o) => o.partnerId)).toEqual(["a"]);
  });
});

describe("隱私", () => {
  const owner = { ownerUserId: "u1", assignedPartnerIds: ["p1"] };
  it("電話只給本人、管理員、被指派夥伴", () => {
    expect(canSeeContact(null, owner)).toBe(false);
    expect(canSeeContact({ userId: "u2", role: "member", partnerIds: [] }, owner)).toBe(false);
    expect(canSeeContact({ userId: "u2", role: "member", partnerIds: ["p2"] }, owner)).toBe(false);
    expect(canSeeContact({ userId: "u2", role: "member", partnerIds: ["p1"] }, owner)).toBe(true);
    expect(canSeeContact({ userId: "u1", role: "member", partnerIds: [] }, owner)).toBe(true);
    expect(canSeeContact({ userId: "u9", role: "admin", partnerIds: [] }, owner)).toBe(true);
  });
  it("遮罩與公開地區", () => {
    expect(maskPhone("0928-510-155")).toBe("0928-***-155");
    expect(publicArea("花蓮縣卓溪鄉卓清村卓樂17鄰62號")).toBe("花蓮縣卓溪鄉");
    expect(publicArea("954臺東縣卑南鄉東興村")).toBe("台東縣卑南鄉");
  });
  it("24 小時未讀提醒改打電話", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    expect(needsPhoneFallback({ createdAt: new Date("2026-11-06T11:00:00Z"), readAt: null }, now, 24)).toBe(true);
    expect(needsPhoneFallback({ createdAt: new Date("2026-11-06T13:00:00Z"), readAt: null }, now, 24)).toBe(false);
    expect(needsPhoneFallback({ createdAt: new Date("2026-11-01T00:00:00Z"), readAt: now }, now, 24)).toBe(false);
  });
});

describe("拆單分配", () => {
  it("依截止日分配，多的留在倉庫", () => {
    const r = allocate(10, [
      { needItemId: "late", remaining: 8, deadline: new Date("2026-12-30"), createdAt: new Date("2026-01-01") },
      { needItemId: "soon", remaining: 4, deadline: new Date("2026-12-01"), createdAt: new Date("2026-02-01") },
      { needItemId: "none", remaining: 5, deadline: null, createdAt: new Date("2025-01-01") },
    ]);
    expect(r.allocations).toEqual([{ needItemId: "soon", quantity: 4 }, { needItemId: "late", quantity: 6 }]);
    expect(r.leftover).toBe(0);
    expect(allocate(3, []).leftover).toBe(3);
  });
});

describe("編號", () => {
  it("格式正確", () => {
    expect(donationCode(new Date("2026-11-06T02:00:00Z"))).toMatch(/^D-20261106-[2-9A-Z]{4}$/);
    expect(inventoryCode()).toMatch(/^Q[2-9A-Z]{8}$/);
  });
});
