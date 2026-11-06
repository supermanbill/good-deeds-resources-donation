import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePartnerAccess } from "@/lib/session";
import { donationLabel, REJECT_REASONS } from "@/lib/status";
import { CATEGORY_RULES, isCategorySlug } from "@/lib/categories";
import { photoUrl } from "@/lib/storage";
import { publicArea } from "@/lib/privacy";
import {
  allocateItem,
  approveDonation,
  checkIn,
  messageDonor,
  rejectDonation,
  requestMoreInfo,
  resumeReview,
  startReview,
} from "../../../actions/partner";

export const dynamic = "force-dynamic";

const YN: Record<string, string> = { yes: "有", no: "沒有", unknown: "不確定" };

export default async function PartnerDonation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { partnerIds } = await requirePartnerAccess();
  const d = await db.donation.findUnique({
    where: { id },
    include: {
      donor: true,
      depot: true,
      partner: { include: { depots: true } },
      campaign: true,
      items: { include: { category: true, photos: true, inventory: true, needItem: { include: { need: true } } } },
    },
  });
  if (!d || (partnerIds && (!d.partnerId || !partnerIds.includes(d.partnerId)))) notFound();

  const events = await db.statusEvent.findMany({ where: { entityType: "donation", entityId: d.id }, orderBy: { createdAt: "asc" } });

  // 可分配的公開需求（同品類）
  const categoryIds = [...new Set(d.items.map((i) => i.categoryId))];
  const openNeedItems =
    d.status === "in_depot"
      ? await db.needItem.findMany({
          where: { categoryId: { in: categoryIds }, need: { status: { in: ["published", "approved", "partially_matched"] } } },
          include: { need: { include: { org: true } } },
        })
      : [];

  const hidden = <input type="hidden" name="donationId" value={d.id} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium">捐贈 {d.code}</h1>
          <p className="muted">登記於 {d.createdAt.toLocaleString("zh-TW")}</p>
        </div>
        <span className="badge !text-sm">{donationLabel(d.status)}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-1 text-sm">
          <h2 className="mb-2 font-medium">捐贈者</h2>
          <p>
            {d.contactName}（{d.donorType === "company" ? "企業／組織" : "個人"}）・好事道會員：{d.donor.name}
          </p>
          <p>
            電話：<a href={`tel:${d.contactPhone}`} className="text-brand-700">{d.contactPhone}</a>
          </p>
          {d.contactEmail && <p>Email：{d.contactEmail}</p>}
          {d.wantsReceipt && <p>需要捐物收據</p>}
          {d.campaign && <p>活動：{d.campaign.title}</p>}
        </section>
        <section className="card space-y-1 text-sm">
          <h2 className="mb-2 font-medium">運送</h2>
          {d.logistics === "pickup" ? (
            <>
              <p>到府收貨：{d.pickupAddress}</p>
              <p>
                電梯：{YN[d.hasElevator]}・1 樓階梯：{YN[d.groundSteps]}
                {d.floor ? `・${d.floor} 樓` : ""}
              </p>
            </>
          ) : (
            <p>
              自行送達：{d.depot?.name}（{d.depot?.address}）
            </p>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">物資明細</h2>
        {d.items.map((it) => {
          const rule = isCategorySlug(it.category.slug) ? CATEGORY_RULES[it.category.slug] : null;
          const conf = JSON.parse(it.confirmations) as Record<string, boolean>;
          const stock = it.inventory.filter((u) => u.status === "in_stock").length;
          const candidates = openNeedItems.filter((n) => n.categoryId === it.categoryId);
          return (
            <div key={it.id} className="card space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="font-medium">
                  {it.name} × {it.quantity} {it.unit}
                </div>
                <span className="badge">{it.category.name}</span>
              </div>
              <div className="muted space-y-0.5">
                {it.usageYears && <p>使用年限：{it.usageYears}</p>}
                {it.expiryDate && <p>有效期限：{it.expiryDate.toLocaleDateString("zh-TW")}</p>}
                {it.condition && <p>狀況：{it.condition}</p>}
                {rule?.confirmations.map((c) => (
                  <p key={c.key}>
                    {conf[c.key] ? "✓" : "✗"} {c.label}
                  </p>
                ))}
                {it.needItem && <p>認領許願：{it.needItem.need.title}</p>}
                {it.inventory.length > 0 && <p>庫存：{it.inventory.length} 箱／件（在倉 {stock}）</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {it.photos.map((p) =>
                  p.mimeType.startsWith("video/") ? (
                    <video key={p.id} src={photoUrl(p.fileName)} controls className="h-32 rounded" />
                  ) : (
                    <a key={p.id} href={photoUrl(p.fileName)} target="_blank">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(p.fileName)} alt="" className="h-32 w-32 rounded object-cover" />
                    </a>
                  ),
                )}
              </div>

              {d.status === "in_depot" && stock > 0 && (
                <form action={allocateItem} className="flex flex-wrap items-end gap-2 border-t pt-3">
                  {hidden}
                  <input type="hidden" name="itemId" value={it.id} />
                  <div className="min-w-56 flex-1">
                    <span className="label">分配給</span>
                    <select name="needItemId" className="input">
                      <option value="auto">自動分配（依截止日優先）</option>
                      {candidates.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.need.org.name}・{n.need.title}・{n.name} 還缺 {Math.max(0, n.quantity - n.fulfilled)} {n.unit}・{publicArea(n.need.deliveryAddress)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <span className="label">箱／件數</span>
                    <input name="units" type="number" min={1} max={stock} defaultValue={stock} className="input" />
                  </div>
                  <button className="btn">分配</button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">處理</h2>

        {d.status === "submitted" && (
          <form action={startReview}>
            {hidden}
            <button className="btn">開始審核</button>
          </form>
        )}

        {d.status === "reviewing" && (
          <div className="grid gap-4 md:grid-cols-3">
            <form action={approveDonation} className="space-y-2">
              {hidden}
              <span className="label">通過（可附註送貨或收件安排）</span>
              <textarea name="note" rows={3} className="input" placeholder={d.logistics === "pickup" ? "例如：大愛搬家會在 3 天內與您聯繫報價" : "例如：請週六上午送到"} />
              <button className="btn w-full">通過</button>
            </form>
            <form action={rejectDonation} className="space-y-2">
              {hidden}
              <span className="label">婉拒（會通知捐贈者原因）</span>
              <select name="reason" className="input" required>
                {Object.entries(REJECT_REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <textarea name="note" rows={2} className="input" placeholder="補充說明" />
              <button className="btn-danger w-full">婉拒</button>
            </form>
            <form action={requestMoreInfo} className="space-y-2">
              {hidden}
              <span className="label">要求補件</span>
              <textarea name="note" rows={3} className="input" required placeholder="例如：請補拍家電通電的照片" />
              <button className="btn-outline w-full">送出補件要求</button>
            </form>
          </div>
        )}

        {d.status === "needs_info" && (
          <form action={resumeReview}>
            {hidden}
            <button className="btn">已收到補件，繼續審核</button>
          </form>
        )}

        {d.status === "awaiting_handover" && (
          <form action={checkIn} className="space-y-3">
            {hidden}
            <div>
              <span className="label">入倉集貨點</span>
              <select name="depotId" className="input" defaultValue={d.depotId ?? undefined}>
                {d.partner?.depots.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.name}
                  </option>
                ))}
              </select>
            </div>
            {d.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm">
                  {it.name}（{it.quantity} {it.unit}）裝成幾箱／幾件？
                </span>
                <input name={`units_${it.id}`} type="number" min={1} max={500} defaultValue={1} className="input w-24" />
              </div>
            ))}
            <p className="muted">入倉後每箱／每件會產生一個 QR 碼，請列印貼在箱外。</p>
            <button className="btn">確認入倉</button>
          </form>
        )}

        {["in_depot", "matched", "in_transit", "delivered", "closed"].includes(d.status) && d.items.some((i) => i.inventory.length) && (
          <a href={`/partner/donations/${d.id}/labels`} className="btn-outline">
            列印 QR 標籤
          </a>
        )}

        <form action={messageDonor} className="flex gap-2 border-t pt-4">
          {hidden}
          <input name="body" className="input" placeholder="透過好事道傳訊息給捐贈者" />
          <button className="btn-outline shrink-0">傳送</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">處理紀錄</h2>
        <ol className="space-y-2 border-l-2 border-brand-100 pl-4 text-sm">
          {events.map((e) => (
            <li key={e.id}>
              <span className="font-medium">{donationLabel(e.toStatus)}</span>
              <span className="muted">・{e.createdAt.toLocaleString("zh-TW")}</span>
              {e.note && <p className="whitespace-pre-line text-stone-600">{e.note}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
