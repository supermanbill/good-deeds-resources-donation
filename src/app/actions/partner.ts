"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePartnerAccess, type CurrentUser } from "@/lib/session";
import { REJECT_REASONS, type RejectReason } from "@/lib/status";
import { allocateToNeed, autoAllocate, moveDonation, receiveIntoDepot, shipToNeed } from "@/lib/workflow";
import { notify } from "@/lib/notify";

async function loadOwnDonation(donationId: string) {
  const { user, partnerIds } = await requirePartnerAccess();
  const d = await db.donation.findUniqueOrThrow({ where: { id: donationId } });
  if (partnerIds && (!d.partnerId || !partnerIds.includes(d.partnerId))) throw new Error("這筆捐贈不是由您的單位負責");
  return { user, d };
}

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

function done(id: string) {
  revalidatePath(`/partner/donations/${id}`);
  revalidatePath("/partner");
}

export async function startReview(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  await moveDonation(d.id, "reviewing", user, "執行夥伴已經開始審核您的捐贈。");
  done(d.id);
}

export async function approveDonation(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const note = s(fd, "note");
  await moveDonation(d.id, "approved", user, note || undefined, { reviewNote: note || null });
  const next =
    d.logistics === "pickup"
      ? `我們會在好事道跟您確認到府收貨的時間與費用。${note ? `\n${note}` : ""}`
      : `請依約定時間把物資送到集貨點，箱子上請寫捐贈單號 ${d.code}。${note ? `\n${note}` : ""}`;
  await moveDonation(d.id, "awaiting_handover", user, next);
  done(d.id);
}

export async function rejectDonation(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const reason = s(fd, "reason") as RejectReason;
  if (!(reason in REJECT_REASONS)) throw new Error("請選擇婉拒原因");
  const note = s(fd, "note");
  if (reason === "other" && !note) throw new Error("選「其他」時請補充說明");
  await moveDonation(
    d.id,
    "rejected",
    user,
    `很抱歉，這次無法收下您的捐贈。原因：${REJECT_REASONS[reason]}${note ? `。${note}` : ""}\n謝謝您的心意。`,
    { rejectReason: reason, reviewNote: note || null },
  );
  done(d.id);
}

export async function requestMoreInfo(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const note = s(fd, "note");
  if (!note) throw new Error("請說明需要補充什麼資料");
  await moveDonation(d.id, "needs_info", user, `請補充資料：${note}\n直接在好事道回覆即可。`, { reviewNote: note });
  done(d.id);
}

export async function resumeReview(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  await moveDonation(d.id, "reviewing", user, "已收到您補充的資料，繼續審核。");
  done(d.id);
}

export async function checkIn(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const depotId = s(fd, "depotId");
  const depot = await db.depot.findUniqueOrThrow({ where: { id: depotId } });
  if (depot.partnerId !== d.partnerId) throw new Error("請選擇本單位的集貨點");
  const items = await db.donationItem.findMany({ where: { donationId: d.id } });
  const units: Record<string, number> = {};
  for (const it of items) {
    const n = Number(s(fd, `units_${it.id}`));
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error(`「${it.name}」的箱數／件數請填 1 到 500`);
    units[it.id] = n;
  }
  await receiveIntoDepot(d.id, depotId, units, user);
  done(d.id);
}

export async function allocateItem(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const itemId = s(fd, "itemId");
  const needItemId = s(fd, "needItemId");
  const units = Number(s(fd, "units"));
  const item = await db.donationItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.donationId !== d.id) throw new Error("品項不屬於這筆捐贈");
  if (needItemId === "auto") {
    await autoAllocate(itemId, user);
  } else {
    if (!Number.isInteger(units) || units < 1) throw new Error("請填分配的箱數／件數");
    await allocateToNeed(itemId, needItemId, units, user);
  }
  done(d.id);
}

export async function shipNeed(fd: FormData) {
  const { user, partnerIds } = await requirePartnerAccess();
  const needId = s(fd, "needId");
  if (partnerIds) {
    const mine = await db.inventoryUnit.count({ where: { needItem: { needId }, status: "allocated", depot: { partnerId: { in: partnerIds } } } });
    if (mine === 0) throw new Error("這筆需求沒有您的單位待出貨的物資");
  }
  await shipToNeed(needId, user);
  revalidatePath("/partner");
}

/** 夥伴在聊天外另外補一則訊息給捐贈者 */
export async function messageDonor(fd: FormData) {
  const { user, d } = await loadOwnDonation(s(fd, "donationId"));
  const body = s(fd, "body");
  if (!body) return;
  await notify(d.donorId, `donation:${d.code}`, `${partnerSign(user)}：${body}`);
  done(d.id);
}

function partnerSign(user: CurrentUser) {
  return user.partnerMemberships[0]?.partner.name ?? "好事公益協會";
}

/** 已經打電話聯繫，把未讀提醒標成已處理 */
export async function markPhoned(fd: FormData) {
  await requirePartnerAccess();
  const threadKey = s(fd, "threadKey");
  await db.chatMessage.updateMany({ where: { threadKey, readAt: null }, data: { fallbackFlaggedAt: new Date() } });
  revalidatePath("/partner");
}
