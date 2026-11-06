/**
 * 聯絡資料（電話、詳細地址）的可見性規則。
 * 電話只給：本人、平台管理員、被指派的執行夥伴人員。不公開在網站上。
 */

export interface Viewer {
  userId: string;
  role: string; // member | admin
  partnerIds: string[];
}

export interface ContactOwner {
  ownerUserId: string;
  /** 被指派負責的夥伴；需求單在媒合／配送後才有 */
  assignedPartnerIds: string[];
}

export function canSeeContact(viewer: Viewer | null, record: ContactOwner): boolean {
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  if (viewer.userId === record.ownerUserId) return true;
  return viewer.partnerIds.some((p) => record.assignedPartnerIds.includes(p));
}

/** 0928510155 → 0928-***-155 */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return "***";
  return `${d.slice(0, 4)}-***-${d.slice(-3)}`;
}

/** 公開頁只顯示到鄉鎮：花蓮縣卓溪鄉卓清村卓樂17鄰62號 → 花蓮縣卓溪鄉 */
export function publicArea(address: string): string {
  const a = address.replace(/^\d{3,6}/, "").replace(/臺/g, "台");
  const m = a.match(/^(.{2}[縣市])(.{1,3}?[鄉鎮市區])?/);
  if (!m) return "";
  return `${m[1]}${m[2] ?? ""}`;
}

/** 好事道訊息超過幾小時沒讀，就提醒服務人員改打電話 */
export function needsPhoneFallback(
  msg: { createdAt: Date; readAt: Date | null },
  now: Date,
  hours: number,
): boolean {
  if (msg.readAt) return false;
  return now.getTime() - msg.createdAt.getTime() >= hours * 3_600_000;
}
