import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Viewer } from "./privacy";
import { goodDeeds } from "./gooddeeds";

const COOKIE = "gd_uid";

/** 目前登入者（mock 模式：cookie 存 User.id） */
export async function currentUser() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    include: { partnerMemberships: { include: { partner: true } }, org: true },
  });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect(`/join?next=${encodeURIComponent(returnTo)}`);
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser("/admin");
  if (u.role !== "admin") redirect("/");
  return u;
}

/** 夥伴後台：回傳登入者所屬的夥伴 id；管理員可以看全部（回傳 null 代表不限） */
export async function requirePartnerAccess(returnTo = "/partner"): Promise<{ user: CurrentUser; partnerIds: string[] | null }> {
  const u = await requireUser(returnTo);
  if (u.role === "admin") return { user: u, partnerIds: null };
  const ids = u.partnerMemberships.map((m) => m.partnerId);
  if (ids.length === 0) redirect("/");
  return { user: u, partnerIds: ids };
}

export function toViewer(u: CurrentUser | null): Viewer | null {
  if (!u) return null;
  return { userId: u.id, role: u.role, partnerIds: u.partnerMemberships.map((m) => m.partnerId) };
}

export async function setSessionUser(userId: string) {
  (await cookies()).set(COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export function loginUrl(returnTo: string) {
  return goodDeeds().loginUrl(returnTo);
}
