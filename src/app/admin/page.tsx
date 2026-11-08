import Link from "next/link";
import { db, parseJson } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { donationLabel, needLabel } from "@/lib/status";
import { addDepot, addPartnerMember, createPartner, reviewNeed, runRecurringCheck, togglePartner } from "../actions/admin";

export const dynamic = "force-dynamic";

const PICKUP: Record<string, string> = { own_fleet: "自家車隊", outsourced: "委外貨運行", none: "不提供到府" };
const ORG: Record<string, string> = { church: "教會", ngo: "NGO", village: "村辦", household: "個人家庭", company: "企業" };

export default async function AdminPage() {
  await requireAdmin();
  const [pendingNeeds, unassigned, partners, categories, users, counts] = await Promise.all([
    db.need.findMany({ where: { status: { in: ["submitted", "reviewing"] } }, include: { org: true, items: true, requester: true }, orderBy: { createdAt: "asc" } }),
    db.donation.findMany({ where: { partnerId: null, status: { notIn: ["rejected", "closed"] } }, include: { items: true } }),
    db.partner.findMany({ include: { depots: true, categories: { include: { category: true } }, members: { include: { user: true } } }, orderBy: { priority: "asc" } }),
    db.category.findMany({ orderBy: { sort: "asc" } }),
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.donation.groupBy({ by: ["status"], _count: true }),
  ]);

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-medium">平台管理｜好事公益協會</h1>

      <section className="flex flex-wrap gap-2 text-sm">
        {counts.map((c) => (
          <span key={c.status} className="badge">
            {donationLabel(c.status)} {c._count}
          </span>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">待審核需求（{pendingNeeds.length}）</h2>
        {pendingNeeds.map((n) => (
          <div key={n.id} className="card space-y-3">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-medium">
                  {n.title}（{n.type === "wish" ? "許願" : "活動申請"}）
                </div>
                <div className="muted">
                  {n.org.name}（{ORG[n.org.type] ?? n.org.type}・{n.org.verified ? "已驗證" : "未驗證"}）・申請人 {n.requester.name}・{n.mobile}
                </div>
                <div className="muted">{n.items.map((i) => `${i.name} ${i.quantity}${i.unit}`).join("、")}</div>
              </div>
              <span className="badge">{needLabel(n.status)}</span>
            </div>
            <p className="whitespace-pre-line text-sm text-stone-600">{n.description}</p>
            <div className="flex flex-wrap gap-3">
              <form action={reviewNeed} className="flex items-center gap-2">
                <input type="hidden" name="needId" value={n.id} />
                <input type="hidden" name="decision" value="approve" />
                {!n.org.verified && (
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="verifyOrg" defaultChecked />
                    同時驗證單位
                  </label>
                )}
                <button className="btn">{n.type === "wish" ? "通過並公開" : "核准"}</button>
              </form>
              <form action={reviewNeed} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="needId" value={n.id} />
                <input type="hidden" name="decision" value="reject" />
                <input name="reason" className="input" placeholder="婉拒原因" required />
                <button className="btn-danger shrink-0">婉拒</button>
              </form>
            </div>
          </div>
        ))}
        {pendingNeeds.length === 0 && <p className="muted">沒有待審核的需求。</p>}
      </section>

      {unassigned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">尚未分派夥伴的捐贈（{unassigned.length}）</h2>
          {unassigned.map((d) => (
            <Link key={d.id} href={`/admin/donations/${d.id}`} className="card block !p-4 text-sm hover:border-brand-600">
              {d.code}・{d.items.map((i) => i.name).join("、")}・{d.logistics === "pickup" ? `到府 ${d.pickupCounty ?? "（縣市不明）"}` : "自行送達"}
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">定期需求檢查</h2>
          <form action={runRecurringCheck}>
            <button className="btn-outline">暫停逾期未確認的定期需求</button>
          </form>
        </div>
        <p className="muted">定期需求每 3 個月要由需求方重新確認，逾期就先暫停公開（正式上線後改成每天自動執行）。</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">執行夥伴（{partners.length}）</h2>
        {partners.map((p) => (
          <div key={p.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">
                  {p.name} {!p.active && <span className="badge !bg-stone-200 !text-stone-600">已停用</span>}
                </div>
                <div className="muted">
                  窗口 {p.contactName} {p.contactPhone}・{PICKUP[p.pickupMode]}・優先序 {p.priority}
                </div>
              </div>
              <form action={togglePartner}>
                <input type="hidden" name="partnerId" value={p.id} />
                <button className="btn-outline !py-1 text-sm">{p.active ? "停用" : "啟用"}</button>
              </form>
            </div>
            <div className="text-sm">
              <p>到府範圍：{parseJson<string[]>(p.serviceAreas, []).join("、") || "無"}</p>
              <p>配送地區：{parseJson<string[]>(p.deliveryAreas, []).join("、") || "無"}</p>
              <p>收件品類：{p.categories.map((c) => c.category.name).join("、") || "無"}</p>
              <p>集貨點：{p.depots.map((d) => `${d.name}（${d.address}）`).join("；") || "無"}</p>
              <p>人員：{p.members.map((m) => `${m.user.name}（${m.role}）`).join("、") || "無"}</p>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-brand-700">新增集貨點／人員</summary>
              <form action={addDepot} className="mt-2 grid gap-2 sm:grid-cols-4">
                <input type="hidden" name="partnerId" value={p.id} />
                <input name="name" className="input" placeholder="名稱" />
                <input name="address" className="input sm:col-span-2" placeholder="地址" required />
                <input name="county" className="input" placeholder="縣市" required />
                <input name="hours" className="input sm:col-span-3" placeholder="收貨時段" />
                <button className="btn">新增集貨點</button>
              </form>
              <form action={addPartnerMember} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="partnerId" value={p.id} />
                <select name="userId" className="input max-w-56">
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <select name="role" className="input max-w-32">
                  <option value="manager">負責人</option>
                  <option value="reviewer">審核員</option>
                  <option value="driver">司機</option>
                </select>
                <button className="btn">加入人員</button>
              </form>
            </details>
          </div>
        ))}

        <details className="card">
          <summary className="cursor-pointer font-medium text-brand-700">＋ 新增執行夥伴</summary>
          <form action={createPartner} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="name" className="input" placeholder="單位名稱" required />
            <input name="slug" className="input" placeholder="代號（英文，例如 hualien-ngo）" required />
            <input name="contactName" className="input" placeholder="窗口姓名" required />
            <input name="contactPhone" className="input" placeholder="窗口電話" required />
            <input name="contactEmail" className="input" placeholder="Email" />
            <input name="priority" type="number" className="input" placeholder="分派優先序（小的優先，預設 100）" />
            <select name="pickupMode" className="input">
              <option value="none">不提供到府收貨</option>
              <option value="own_fleet">自家車隊到府</option>
              <option value="outsourced">委外貨運行到府</option>
            </select>
            <input name="serviceAreas" className="input" placeholder="到府範圍縣市，用頓號分隔" />
            <input name="pickupNote" className="input" placeholder="到府說明" />
            <input name="pickupFeeNote" className="input" placeholder="到府收費規則" />
            <input name="deliveryAreas" className="input sm:col-span-2" placeholder="可配送地區，用頓號分隔" />
            <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-1">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked />
                  {c.name}
                </label>
              ))}
            </fieldset>
            <input name="depotName" className="input" placeholder="第一個集貨點名稱" />
            <input name="depotAddress" className="input" placeholder="集貨點地址" />
            <input name="depotCounty" className="input" placeholder="集貨點縣市" />
            <input name="depotHours" className="input" placeholder="收貨時段" />
            <button className="btn sm:col-span-2">建立夥伴</button>
          </form>
        </details>
      </section>
    </div>
  );
}
