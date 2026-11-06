"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clearSession, setSessionUser } from "@/lib/session";

function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";
}

/** mock 模式登入：選擇示範帳號 */
export async function mockLogin(formData: FormData) {
  if ((process.env.GOODDEEDS_MODE ?? "mock") !== "mock") throw new Error("正式模式請透過好事道登入");
  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("找不到帳號");
  await setSessionUser(user.id);
  redirect(safeNext(String(formData.get("next") ?? "")));
}

/** mock 模式註冊：建立新的好事道會員 */
export async function mockRegister(formData: FormData) {
  if ((process.env.GOODDEEDS_MODE ?? "mock") !== "mock") throw new Error("正式模式請透過好事道註冊");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("請填寫姓名");
  const user = await db.user.create({
    data: {
      goodDeedsId: `mock-${Date.now()}`,
      name,
      email: String(formData.get("email") ?? "") || null,
      phone: String(formData.get("phone") ?? "") || null,
    },
  });
  await setSessionUser(user.id);
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function logout() {
  await clearSession();
  redirect("/");
}
