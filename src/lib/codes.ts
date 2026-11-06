import { randomBytes } from "node:crypto";

// 去掉容易看錯的 0 O 1 I L
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomChars(n: number): string {
  const bytes = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function ymd(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3_600_000); // 台灣時間
  return t.toISOString().slice(0, 10).replace(/-/g, "");
}

/** 捐贈單號 D-20261106-7KQ4 */
export function donationCode(now = new Date()): string {
  return `D-${ymd(now)}-${randomChars(4)}`;
}

/** 需求單號 N-20261106-7KQ4 */
export function needCode(now = new Date()): string {
  return `N-${ymd(now)}-${randomChars(4)}`;
}

/** 庫存 QR 碼 Q7KQ4M2XP */
export function inventoryCode(): string {
  return `Q${randomChars(8)}`;
}
