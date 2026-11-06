import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/session";
import { logout } from "./actions/auth";

export const metadata: Metadata = {
  title: "好事道物資媒合｜好事公益協會",
  description: "即期品、二手傢俱、家電、生活用品捐贈與偏鄉需求媒合平台",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const isPartner = !!user && (user.role === "admin" || user.partnerMemberships.length > 0);
  return (
    <html lang="zh-Hant-TW">
      <body>
        <header className="no-print border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="text-base font-medium text-brand-700">
              好事道物資媒合
            </Link>
            <Link href="/wishes">許願池</Link>
            <Link href="/campaigns">專案活動</Link>
            <Link href="/donate">我要捐物資</Link>
            <Link href="/needs/new">我要提需求</Link>
            <Link href="/give">捐款</Link>
            <span className="flex-1" />
            {isPartner && <Link href="/partner">夥伴後台</Link>}
            {user?.role === "admin" && <Link href="/admin">平台管理</Link>}
            {user ? (
              <>
                <Link href="/me">我的好事</Link>
                <form action={logout}>
                  <button className="text-stone-500">登出</button>
                </form>
              </>
            ) : (
              <Link href="/join" className="btn !py-1.5">
                加入好事道
              </Link>
            )}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="no-print mx-auto max-w-5xl px-4 pb-10 text-xs text-stone-500">
          主辦與受款單位：社團法人好事公益協會｜技術平台：好事道
        </footer>
      </body>
    </html>
  );
}
