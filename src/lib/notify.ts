import { db } from "./db";
import { goodDeeds } from "./gooddeeds";
import { donationLabel, needLabel } from "./status";
import { needsPhoneFallback } from "./privacy";

/** 送一則好事道聊天訊息，並留下本地紀錄（用來判斷是否需要電話備援） */
export async function notify(userId: string, threadKey: string, body: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await db.chatMessage.create({ data: { userId, threadKey, body } });
  await goodDeeds().sendChat({ userId, goodDeedsId: user.goodDeedsId, threadKey, body });
}

/** 寫入狀態紀錄並通知對方 */
export async function recordStatus(opts: {
  entityType: "donation" | "need";
  entityId: string;
  code: string;
  from: string | null;
  to: string;
  note?: string;
  actorId?: string;
  notifyUserId: string;
}) {
  await db.statusEvent.create({
    data: {
      entityType: opts.entityType,
      entityId: opts.entityId,
      fromStatus: opts.from,
      toStatus: opts.to,
      note: opts.note,
      actorId: opts.actorId,
    },
  });
  const label = opts.entityType === "donation" ? donationLabel(opts.to) : needLabel(opts.to);
  const kind = opts.entityType === "donation" ? "捐贈" : "需求";
  const body = `您的${kind}（${opts.code}）狀態更新：${label}${opts.note ? `\n${opts.note}` : ""}`;
  await notify(opts.notifyUserId, `${opts.entityType}:${opts.code}`, body);
}

export function fallbackHours(): number {
  const h = Number(process.env.CONTACT_FALLBACK_HOURS ?? 24);
  return Number.isFinite(h) && h > 0 ? h : 24;
}

/** 超過時限沒讀的訊息，依對話串整理成「需電話聯繫」清單 */
export async function overdueThreads(now = new Date()) {
  const hours = fallbackHours();
  const cutoff = new Date(now.getTime() - hours * 3_600_000);
  const msgs = await db.chatMessage.findMany({
    where: { readAt: null, fallbackFlaggedAt: null, createdAt: { lte: cutoff } },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const byThread = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) {
    if (needsPhoneFallback(m, now, hours) && !byThread.has(m.threadKey)) byThread.set(m.threadKey, m);
  }
  return [...byThread.values()];
}
