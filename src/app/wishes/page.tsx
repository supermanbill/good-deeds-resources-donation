import Link from "next/link";
import { db } from "@/lib/db";
import { publicArea } from "@/lib/privacy";
import { needLabel } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function WishesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const categories = await db.category.findMany({ where: { active: true }, orderBy: { sort: "asc" } });
  const wishes = await db.need.findMany({
    where: {
      type: "wish",
      status: { in: ["published", "partially_matched"] },
      ...(category ? { items: { some: { category: { slug: category } } } } : {}),
    },
    include: { org: true, items: { include: { category: true } } },
    orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium">許願池</h1>
        <p className="muted mt-1">偏鄉教會、NGO、村辦與家庭的需求。看到能幫上忙的，按「我來捐」就可以認領。</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/wishes" className={!category ? "badge" : "rounded-full border px-2.5 py-0.5"}>
          全部
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/wishes?category=${c.slug}`}
            className={category === c.slug ? "badge" : "rounded-full border px-2.5 py-0.5"}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {wishes.map((w) => (
          <Link key={w.id} href={`/wishes/${w.id}`} className="card block space-y-2 hover:border-brand-600">
            <div className="flex flex-wrap gap-2">
              <span className="badge">{needLabel(w.status)}</span>
              {w.frequency !== "once" && <span className="badge">{w.frequency === "monthly" ? "每月" : "每季"}</span>}
              {w.deadline && <span className="badge">{w.deadline.toLocaleDateString("zh-TW")} 前</span>}
            </div>
            <h2 className="font-medium">{w.title}</h2>
            <p className="muted">
              {w.org.name}・{publicArea(w.deliveryAddress)}
            </p>
            <ul className="text-sm">
              {w.items.map((i) => (
                <li key={i.id}>
                  {i.name}：還需要 {Math.max(0, i.quantity - i.fulfilled)} / {i.quantity} {i.unit}
                </li>
              ))}
            </ul>
          </Link>
        ))}
        {wishes.length === 0 && <p className="muted">目前沒有符合的許願。</p>}
      </div>
    </div>
  );
}
