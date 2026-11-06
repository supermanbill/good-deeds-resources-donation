/**
 * 捐贈單與需求單的狀態機。
 * 所有狀態變更都必須經過 assertTransition，避免跳步或倒退。
 */

export const DONATION_STATUSES = {
  submitted: "已送出",
  reviewing: "審核中",
  needs_info: "待補件",
  rejected: "已婉拒",
  approved: "已通過",
  awaiting_handover: "待送達／待取件",
  in_depot: "已入倉",
  matched: "已媒合",
  in_transit: "配送中",
  delivered: "已送達",
  closed: "已結案",
} as const;

export type DonationStatus = keyof typeof DONATION_STATUSES;

const DONATION_FLOW: Record<DonationStatus, DonationStatus[]> = {
  submitted: ["reviewing"],
  reviewing: ["approved", "rejected", "needs_info"],
  needs_info: ["reviewing"],
  rejected: [],
  approved: ["awaiting_handover"],
  // 認領許願且自行送達時，可以不入倉直接配送
  awaiting_handover: ["in_depot", "in_transit"],
  in_depot: ["matched"],
  matched: ["in_transit"],
  in_transit: ["delivered"],
  delivered: ["closed"],
  closed: [],
};

export const NEED_STATUSES = {
  submitted: "已送出",
  reviewing: "審核中",
  rejected: "已婉拒",
  published: "公開募集中",
  approved: "已核准",
  partially_matched: "部分媒合",
  matched: "已媒合",
  in_transit: "配送中",
  received: "已收貨",
  awaiting_report: "待回報發放",
  closed: "已結案",
  paused: "暫停公開",
} as const;

export type NeedStatus = keyof typeof NEED_STATUSES;

const NEED_FLOW: Record<NeedStatus, NeedStatus[]> = {
  submitted: ["reviewing"],
  reviewing: ["published", "approved", "rejected"],
  rejected: [],
  published: ["partially_matched", "matched", "paused", "in_transit"],
  approved: ["partially_matched", "matched", "in_transit"],
  // 部分媒合時可以先送一批
  partially_matched: ["matched", "in_transit", "paused"],
  matched: ["in_transit"],
  in_transit: ["received"],
  received: ["awaiting_report"],
  awaiting_report: ["closed"],
  closed: [],
  // 定期需求逾期沒有重新確認就暫停，確認後恢復
  paused: ["published"],
};

export function canTransition(kind: "donation", from: DonationStatus, to: DonationStatus): boolean;
export function canTransition(kind: "need", from: NeedStatus, to: NeedStatus): boolean;
export function canTransition(kind: "donation" | "need", from: string, to: string): boolean {
  const flow = (kind === "donation" ? DONATION_FLOW : NEED_FLOW) as Record<string, string[]>;
  return flow[from]?.includes(to) ?? false;
}

export class TransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`${kind} 狀態不能從「${from}」變成「${to}」`);
  }
}

export function assertTransition(kind: "donation" | "need", from: string, to: string): void {
  if (!canTransition(kind as "donation", from as DonationStatus, to as DonationStatus)) {
    throw new TransitionError(kind, from, to);
  }
}

export function donationLabel(s: string): string {
  return DONATION_STATUSES[s as DonationStatus] ?? s;
}

export function needLabel(s: string): string {
  return NEED_STATUSES[s as NeedStatus] ?? s;
}

/** 需求依媒合數量決定狀態：全部湊齊為 matched，部分為 partially_matched */
export function needStatusFromFulfillment(
  items: { quantity: number; fulfilled: number }[],
): "matched" | "partially_matched" | null {
  const total = items.reduce((s, i) => s + i.quantity, 0);
  const got = items.reduce((s, i) => s + Math.min(i.fulfilled, i.quantity), 0);
  if (got === 0) return null;
  return got >= total ? "matched" : "partially_matched";
}

/** 婉拒原因（審核員必選一項，再補充說明） */
export const REJECT_REASONS = {
  not_eligible: "不符合收件條件",
  condition: "物品狀況不佳",
  expiry: "有效期限不足 3 個月",
  not_working: "家電無法正常運作",
  no_demand: "目前沒有對應需求",
  over_capacity: "倉庫已滿，暫停收件",
  out_of_area: "超出到府收貨範圍",
  other: "其他",
} as const;

export type RejectReason = keyof typeof REJECT_REASONS;

/** 定期需求的重新確認週期：每 3 個月 */
export const RECURRING_REVIEW_DAYS = 90;

export function nextReviewDate(from: Date): Date {
  return new Date(from.getTime() + RECURRING_REVIEW_DAYS * 24 * 60 * 60 * 1000);
}
