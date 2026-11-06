import Link from "next/link";
import { db } from "@/lib/db";
import { requirePartnerAccess } from "@/lib/session";
import { donationLabel, needLabel } from "@/lib/status";
import { overdueThreads, fallbackHours } from "@/lib/notify";
import { maskPhone } from "@/lib/privacy";
import { markPhoned, shipNeed } from "../actions/partner";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; statuses: string[] }[] = [
  { title: "待審核", statuses: ["submitted", "reviewing", "needs_info"] },
  { title: "待送達／待取件", statuses: ["awaiting_handover"] },
  { title: "在倉庫，待分配", statuses: ["in_depot"] },
  { title: "已分配／配送中", statuses: ["matched", "in_transit"] },
];

export default async function PartnerHome() {
  const { user, partnerIds } = await requirePartnerAccess();
  const scope = partnerIds ? { partnerId: { in: partnerIds } } : {};

  const donations = await db.donation.findMany({
    where: { ...scope, status: { in: GROUPS.flatMap((g) => g.statuses) } },
    include: { items: true, partner: true },
    orderBy: { createdAt: "asc" },
  });
  const unassigned = user.role === "admin" ? await db.donation.findMany({ where: { partnerId: null, status: { notIn: ["rejected", "closed"] } } }) : [];

  // 待出貨：本單位已分配給需求、還沒出貨的庫存
  const toShip = await db.need.findMany({
    where: {
      items: {
        some: { inventory: { some: { status: "allocated", ...(partnerIds ? { depot: { partnerId: { in: partnerIds } } } : {}) } } },
      },
    },
    include: { org: true, items: { include: { inventory: { where: { status: "allocated" } } } } },
  });

  // 電話備援：好事道訊息超過時限沒讀
  const myCodes = new Set([
    ...(await db.donation.findMany({ where: scope, select: { code: true } })).map((d) => `donation:${d.code}`),
    ...(
      await db.need.findMany({
        where: partnerIds ? { items: { some: { inventory: { some: { depot: { partnerId: { in: partnerIds } } } } } } } : {},
        select: { code: true },
      })
    ).map((n) => `need:${n.code}`),
  ]);
  const staffIds = new Set((await db.partnerMember.findMany({ select: { userId: true } })).map((m) => m.userId));
  const overdue = (await overdueThreads()).filter((m) => myCodes.has(m.threadKey) && !staffIds.has(m.userId) && m.user.role !== "admin");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium">夥伴後台</h1>
        <p className="muted">{partnerIds ? user.partnerMemberships.map((m) => m.partner.name).join("、") : "平台管理員（可查看所有夥伴）"}</p>
      </div>

      {overdue.length > 0 && (
        <section className="card space-y-3 border-amber-300 bg-amber-50">
          <h2 className="font-medium text-amber-900">需要電話聯繫（好事道訊息超過 {fallbackHours()} 小時未讀）</h2>
          {overdue.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {m.threadKey.replace("donation:", "捐贈 ").replace("need:", "需求 ")}・{m.user.name}・
                {m.user.phone ? <a href={`tel:${m.user.phone}`} className="text-brand-700 underline">{m.user.phone}</a> : "沒有留電話"}
              </span>
              <form action={markPhoned}>
                <input type="hidden" name="threadKey" value={m.threadKey} />
                <button className="btn-outline !py-1 text-xs">已電話聯繫</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {unassigned.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-medium">尚未分派夥伴</h2>
          {unassigned.map((d) => (
            <Link key={d.id} href={`/admin/donations/${d.id}`} className="block text-sm text-brand-700">
              {d.code}・{d.pickupCounty ?? "未知縣市"}・{donationLabel(d.status)}
            </Link>
          ))}
        </section>
      )}

      {GROUPS.map((g) => {
        const list = donations.filter((d) => g.statuses.includes(d.status));
        return (
          <section key={g.title} className="space-y-2">
            <h2 className="font-medium">
              {g.title}（{list.length}）
            </h2>
            {list.length === 0 && <p className="muted">沒有案件</p>}
            {list.map((d) => (
              <Link key={d.id} href={`/partner/donations/${d.id}`} className="card flex flex-wrap items-center justify-between gap-2 !p-4 hover:border-brand-600">
                <div>
                  <div className="font-medium">
                    {d.code}・{d.items.map((i) => i.name).join("、")}
                  </div>
                  <div className="muted">
                    {d.contactName}（{maskPhone(d.contactPhone)}）・{d.logistics === "pickup" ? `到府收貨・${d.pickupCounty ?? ""}` : "自行送達"}
                    {!partnerIds && d.partner ? `・${d.partner.name}` : ""}
                  </div>
                </div>
                <span className="badge">{donationLabel(d.status)}</span>
              </Link>
            ))}
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="font-medium">待出貨（{toShip.length}）</h2>
        {toShip.length === 0 && <p className="muted">沒有待出貨的需求</p>}
        {toShip.map((n) => (
          <div key={n.id} className="card flex flex-wrap items-center justify-between gap-3 !p-4">
            <div>
              <div className="font-medium">
                {n.title}（{n.org.name}）
              </div>
              <div className="muted">
                {needLabel(n.status)}・{n.items.reduce((s, i) => s + i.inventory.length, 0)} 箱／件・
                <Link href={`/partner/needs/${n.id}`} className="text-brand-700">
                  收貨資訊與 QR 標籤
                </Link>
              </div>
            </div>
            <form action={shipNeed}>
              <input type="hidden" name="needId" value={n.id} />
              <button className="btn">標記出貨</button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
