/**
 * 跨捐贈單、需求單的流程操作。所有狀態變更都經過狀態機檢查並留下紀錄、通知對方。
 */
import { db } from "./db";
import { assertTransition, needStatusFromFulfillment, nextReviewDate, type NeedStatus } from "./status";
import { recordStatus } from "./notify";
import { inventoryCode } from "./codes";
import { allocate } from "./match";

type Actor = { id: string };

export async function moveDonation(donationId: string, to: string, actor: Actor, note?: string, patch: Record<string, unknown> = {}) {
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId } });
  assertTransition("donation", d.status, to);
  await db.donation.update({ where: { id: d.id }, data: { status: to, ...patch } });
  await recordStatus({ entityType: "donation", entityId: d.id, code: d.code, from: d.status, to, note, actorId: actor.id, notifyUserId: d.donorId });
}

export async function moveNeed(needId: string, to: string, actor: Actor, note?: string, patch: Record<string, unknown> = {}) {
  const n = await db.need.findUniqueOrThrow({ where: { id: needId } });
  assertTransition("need", n.status, to);
  await db.need.update({ where: { id: n.id }, data: { status: to, ...patch } });
  await recordStatus({ entityType: "need", entityId: n.id, code: n.code, from: n.status, to, note, actorId: actor.id, notifyUserId: n.requesterId });
}

/** 入倉：每個品項依箱數／件數產生 QR 碼；認領許願的品項直接配給該許願 */
export async function receiveIntoDepot(donationId: string, depotId: string, unitsPerItem: Record<string, number>, actor: Actor) {
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId }, include: { items: true } });
  for (const item of d.items) {
    const n = Math.max(0, Math.floor(unitsPerItem[item.id] ?? 0));
    for (let i = 0; i < n; i++) {
      await db.inventoryUnit.create({ data: { code: inventoryCode(), donationItemId: item.id, depotId } });
    }
  }
  await moveDonation(donationId, "in_depot", actor, "物資已經進入集貨點，接下來會安排送到需要的地方。", { depotId });

  for (const item of d.items.filter((i) => i.needItemId)) {
    const units = await db.inventoryUnit.count({ where: { donationItemId: item.id, status: "in_stock" } });
    if (units > 0) await allocateToNeed(item.id, item.needItemId!, units, actor);
  }
}

/**
 * 把某個捐贈品項在倉庫的庫存，配給一個需求品項。
 * quantity 以「庫存單位」計（一個 QR 一單位），同時把需求的已到位數量加上捐贈品項數量的比例。
 */
export async function allocateToNeed(donationItemId: string, needItemId: string, units: number, actor: Actor) {
  const item = await db.donationItem.findUniqueOrThrow({ where: { id: donationItemId }, include: { inventory: true } });
  const needItem = await db.needItem.findUniqueOrThrow({ where: { id: needItemId }, include: { need: { include: { items: true } } } });
  const stock = item.inventory.filter((u) => u.status === "in_stock");
  const take = stock.slice(0, Math.min(units, stock.length));
  if (take.length === 0) throw new Error("這個品項沒有庫存可以分配");

  // 一個庫存單位代表的數量（例如 10 包裝成 2 箱，每箱 5 包）
  const perUnit = item.quantity / Math.max(1, item.inventory.length);
  const qty = Math.max(1, Math.round(perUnit * take.length));

  await db.inventoryUnit.updateMany({ where: { id: { in: take.map((u) => u.id) } }, data: { status: "allocated", needItemId } });
  await db.match.create({ data: { donationItemId, needItemId, quantity: qty } });
  await db.needItem.update({ where: { id: needItemId }, data: { fulfilled: { increment: qty } } });

  // 需求狀態：依到位數量變成部分媒合／已媒合
  const items = await db.needItem.findMany({ where: { needId: needItem.needId } });
  const target = needStatusFromFulfillment(items);
  const need = needItem.need;
  if (target && target !== need.status && ["published", "approved", "partially_matched"].includes(need.status)) {
    await moveNeed(need.id, target, actor, target === "matched" ? "需要的物資已經全部到位，準備出貨。" : "已經有部分物資到位。");
  }

  // 捐贈狀態：所有庫存都分配出去就是已媒合
  const left = await db.inventoryUnit.count({ where: { donationItem: { donationId: item.donationId }, status: "in_stock" } });
  const donation = await db.donation.findUniqueOrThrow({ where: { id: item.donationId } });
  if (left === 0 && donation.status === "in_depot") {
    await moveDonation(donation.id, "matched", actor, `您捐的物資已經配給：${need.title}`);
  }
}

/** 自動分配：依截止日把庫存分給同品類、還沒滿足的公開需求 */
export async function autoAllocate(donationItemId: string, actor: Actor) {
  const item = await db.donationItem.findUniqueOrThrow({ where: { id: donationItemId }, include: { inventory: true } });
  const stock = item.inventory.filter((u) => u.status === "in_stock").length;
  if (stock === 0) return { allocated: 0 };
  const perUnit = item.quantity / Math.max(1, item.inventory.length);
  const open = await db.needItem.findMany({
    where: { categoryId: item.categoryId, need: { status: { in: ["published", "approved", "partially_matched"] } } },
    include: { need: true },
  });
  // 需求剩餘數量換算成庫存單位
  const { allocations } = allocate(
    stock,
    open.map((n) => ({
      needItemId: n.id,
      remaining: Math.ceil(Math.max(0, n.quantity - n.fulfilled) / perUnit),
      deadline: n.need.latestArrival ?? n.need.deadline,
      createdAt: n.need.createdAt,
    })),
  );
  for (const a of allocations) await allocateToNeed(donationItemId, a.needItemId, a.quantity, actor);
  return { allocated: allocations.reduce((s, a) => s + a.quantity, 0) };
}

/** 出貨：把配給某個需求的庫存標成配送中 */
export async function shipToNeed(needId: string, actor: Actor) {
  const units = await db.inventoryUnit.findMany({
    where: { status: "allocated", needItem: { needId } },
    include: { donationItem: { include: { donation: true } } },
  });
  if (units.length === 0) throw new Error("沒有已分配、待出貨的物資");
  await db.inventoryUnit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: { status: "shipped" } });
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (need.status !== "in_transit") await moveNeed(needId, "in_transit", actor, "物資已經出發，到貨時請掃描箱上的 QR 碼確認收貨。");

  const donationIds = [...new Set(units.map((u) => u.donationItem.donationId))];
  for (const id of donationIds) {
    const d = await db.donation.findUniqueOrThrow({ where: { id } });
    if (d.status === "matched") await moveDonation(id, "in_transit", actor, `您捐的物資正在送往：${need.title}`);
  }
}

/** 收貨：掃 QR 碼確認一個庫存單位送達；整批到齊就推進需求與捐贈狀態 */
export async function confirmDelivery(code: string, actor: Actor, opts: { note?: string; photoIds: string[]; onBehalf: boolean }) {
  const unit = await db.inventoryUnit.findUniqueOrThrow({ where: { code }, include: { needItem: true, donationItem: true } });
  if (!unit.needItem) throw new Error("這個 QR 碼還沒有配給任何需求");
  if (unit.status === "delivered") return { alreadyDelivered: true };
  if (unit.status !== "shipped") throw new Error("這批物資還沒出貨");
  const needId = unit.needItem.needId;

  await db.inventoryUnit.update({ where: { id: unit.id }, data: { status: "delivered", deliveredAt: new Date() } });

  if (opts.photoIds.length || opts.note) {
    const proof = await db.proof.create({
      data: { needId, kind: "received", note: opts.note || null, uploadedById: actor.id, onBehalf: opts.onBehalf },
    });
    await db.photo.updateMany({ where: { id: { in: opts.photoIds }, donationItemId: null, proofId: null }, data: { proofId: proof.id, kind: "proof" } });
  }

  // 這個需求所有已出貨的都送到了 → 已收貨 → 待回報發放
  const pending = await db.inventoryUnit.count({ where: { needItem: { needId }, status: "shipped" } });
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (pending === 0 && need.status === "in_transit") {
    await moveNeed(needId, "received", actor, "已確認收貨，謝謝！");
    await moveNeed(needId, "awaiting_report", actor, "物資發放後，請回到好事道回報送給哪些家庭或用在哪個活動。");
  }

  // 捐贈品項所屬的捐贈單：全部送達就是已送達
  const donationId = unit.donationItem.donationId;
  const undelivered = await db.inventoryUnit.count({ where: { donationItem: { donationId }, status: { not: "delivered" } } });
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId } });
  if (undelivered === 0 && d.status === "in_transit") {
    await moveDonation(donationId, "delivered", actor, "您捐的物資已經全部送達，收貨單位的發放回報出來後會再通知您。");
  }
  return { alreadyDelivered: false };
}

/** 發放回報：結案，並通知相關捐贈者；定期需求自動開下一期 */
export async function reportDistribution(
  needId: string,
  actor: Actor,
  r: { householdCount: number | null; occasion: string; note: string; photoIds: string[]; onBehalf: boolean },
) {
  const need = await db.need.findUniqueOrThrow({ where: { id: needId }, include: { items: true } });
  const proof = await db.proof.create({
    data: {
      needId,
      kind: "distributed",
      householdCount: r.householdCount,
      occasion: r.occasion || null,
      note: r.note || null,
      uploadedById: actor.id,
      onBehalf: r.onBehalf,
    },
  });
  await db.photo.updateMany({ where: { id: { in: r.photoIds }, donationItemId: null, proofId: null }, data: { proofId: proof.id, kind: "proof" } });
  await moveNeed(needId, "closed", actor, "謝謝您的回報，這筆需求已經結案。");

  // 通知捐贈者並結案
  const donations = await db.donation.findMany({
    where: { items: { some: { inventory: { some: { needItem: { needId } } } } } },
  });
  for (const d of donations) {
    if (d.status === "delivered") {
      await moveDonation(
        d.id,
        "closed",
        actor,
        `收貨單位回報：${r.householdCount ? `送給 ${r.householdCount} 戶家庭` : "物資已發放"}${r.occasion ? `，用在「${r.occasion}」` : ""}。這份好事已記錄在您的好事履歷。`,
      );
    }
  }

  // 定期需求：複製成下一期，重新公開募集
  if (need.frequency !== "once") {
    const { id: _id, code: _c, status: _s, createdAt: _ca, updatedAt: _ua, items, ...rest } = need;
    const { needCode } = await import("./codes");
    const next = await db.need.create({
      data: {
        ...rest,
        code: needCode(),
        status: "published",
        deadline: null,
        latestArrival: null,
        items: { create: items.map((i) => ({ categoryId: i.categoryId, name: i.name, quantity: i.quantity, unit: i.unit })) },
      },
    });
    await recordStatus({
      entityType: "need",
      entityId: next.id,
      code: next.code,
      from: null,
      to: "published",
      note: "定期需求已自動開啟下一期，公開在許願池。",
      actorId: actor.id,
      notifyUserId: need.requesterId,
    });
  }
}

/** 定期需求重新確認：延後下次確認日；暫停中的恢復公開 */
export async function reconfirmRecurring(needId: string, actor: Actor) {
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (need.frequency === "once") throw new Error("只有定期需求需要重新確認");
  await db.need.update({ where: { id: needId }, data: { nextReviewAt: nextReviewDate(new Date()) } });
  if ((need.status as NeedStatus) === "paused") await moveNeed(needId, "published", actor, "已重新確認，恢復公開募集。");
}

/** 逾期沒有重新確認的定期需求，暫停公開 */
export async function pauseOverdueRecurring(actor: Actor, now = new Date()) {
  const overdue = await db.need.findMany({
    where: { frequency: { not: "once" }, status: { in: ["published", "partially_matched"] }, nextReviewAt: { lt: now } },
  });
  for (const n of overdue) await moveNeed(n.id, "paused", actor, "這筆定期需求已經 3 個月沒有確認，先暫停公開。請到「我的好事」重新確認。");
  return overdue.length;
}
