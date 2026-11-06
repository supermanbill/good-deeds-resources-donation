"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { assignedPartnerIds } from "@/lib/partners";
import { confirmDelivery, reconfirmRecurring, reportDistribution } from "@/lib/workflow";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

async function actorFor(needId: string) {
  const user = await currentUser();
  if (!user) return null;
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (need.requesterId === user.id || (user.orgId && user.orgId === need.orgId)) return { user, onBehalf: false };
  if (user.role === "admin") return { user, onBehalf: true };
  const mine = user.partnerMemberships.map((m) => m.partnerId);
  const assigned = await assignedPartnerIds(needId);
  if (mine.some((p) => assigned.includes(p))) return { user, onBehalf: true };
  return null;
}

export async function confirmReceipt(code: string, note: string, photoIds: string[]): Promise<ActionResult> {
  const unit = await db.inventoryUnit.findUnique({ where: { code }, include: { needItem: true } });
  if (!unit?.needItem) return { ok: false, error: "找不到這個 QR 碼，或還沒有配給任何需求" };
  const a = await actorFor(unit.needItem.needId);
  if (!a) return { ok: false, error: "請用收貨單位的好事道帳號登入" };
  try {
    const r = await confirmDelivery(code, a.user, { note, photoIds, onBehalf: a.onBehalf });
    revalidatePath(`/r/${code}`);
    return { ok: true, message: r.alreadyDelivered ? "這箱已經確認過收貨了。" : "已確認收貨，謝謝！" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function submitReport(
  needId: string,
  r: { householdCount: number | null; occasion: string; note: string; photoIds: string[] },
): Promise<ActionResult> {
  const a = await actorFor(needId);
  if (!a) return { ok: false, error: "沒有權限回報這筆需求" };
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (need.status !== "awaiting_report") return { ok: false, error: "這筆需求目前不需要回報" };
  if (r.photoIds.length === 0) return { ok: false, error: "請至少上傳一張發放現場的照片" };
  if (!r.householdCount && !r.occasion) return { ok: false, error: "請填寫發放戶數，或用在哪個活動" };
  await reportDistribution(needId, a.user, { ...r, onBehalf: a.onBehalf });
  revalidatePath("/me");
  return { ok: true, message: "已回報，謝謝！捐贈者會收到通知。" };
}

export async function reconfirm(fd: FormData) {
  const needId = String(fd.get("needId") ?? "");
  const a = await actorFor(needId);
  if (!a || a.onBehalf) throw new Error("只有需求方可以重新確認");
  await reconfirmRecurring(needId, a.user);
  revalidatePath("/me");
}
