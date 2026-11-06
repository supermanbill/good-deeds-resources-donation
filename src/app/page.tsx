import Link from "next/link";
import { db } from "@/lib/db";
import { publicArea } from "@/lib/privacy";
import { needLabel } from "@/lib/status";

export const dynamic = "force-dynamic";

const PUBLIC_NEED = ["published", "partially_matched", "approved"];

export default async function Home() {
  const [campaigns, wishes, delivered, households, partners] = await Promise.all([
    db.campaign.findMany({ where: { status: "open" }, orderBy: { endsAt: "asc" }, take: 3 }),
    db.need.findMany({
      where: { type: "wish", status: { in: PUBLIC_NEED } },
      include: { org: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.inventoryUnit.count({ where: { status: "delivered" } }),
    db.proof.aggregate({ _sum: { householdCount: true } }),
    db.partner.count({ where: { active: true } }),
  ]);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-2xl font-medium leading-snug sm:text-3xl">
          一邊有物資想捐，一邊有需要。
          <br />
          好事道幫你們接起來。
        </h1>
        <p className="max-w-2xl text-stone-600">
          即期品、二手傢俱、家電、衣物鞋子，經過執行夥伴審核，送到偏鄉教會、NGO、村辦與需要的家庭。每一件物資送到哪裡、幫了誰，都看得到。
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/donate" className="btn">
            我要捐物資
          </Link>
          <Link href="/needs/new" className="btn-outline">
            我們需要物資
          </Link>
          <Link href="/give" className="btn-outline">
            捐款支持運費
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat n={delivered} label="件物資已送達" />
        <Stat n={households._sum.householdCount ?? 0} label="戶家庭受益" />
        <Stat n={partners} label="個執行夥伴" />
      </section>

      {campaigns.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">進行中的專案活動</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.slug}`} className="card block hover:border-brand-600">
                <div className="badge mb-2">截止 {c.endsAt.toLocaleDateString("zh-TW")}</div>
                <h3 className="font-medium">{c.title}</h3>
                <p className="muted mt-1">{c.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium">最新許願</h2>
          <Link href="/wishes" className="text-sm text-brand-700">
            看全部許願 →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {wishes.map((w) => (
            <Link key={w.id} href={`/wishes/${w.id}`} className="card block hover:border-brand-600">
              <div className="mb-1 flex gap-2">
                <span className="badge">{needLabel(w.status)}</span>
                {w.frequency !== "once" && <span className="badge">{w.frequency === "monthly" ? "每月" : "每季"}</span>}
              </div>
              <h3 className="font-medium">{w.title}</h3>
              <p className="muted">
                {w.org.name}・{publicArea(w.deliveryAddress)}
              </p>
            </Link>
          ))}
          {wishes.length === 0 && <p className="muted">目前沒有公開的許願。</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="card !p-4">
      <div className="text-2xl font-medium text-brand-700">{n.toLocaleString("zh-TW")}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
