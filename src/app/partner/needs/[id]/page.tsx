import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePartnerAccess, toViewer } from "@/lib/session";
import { canSeeContact, maskPhone } from "@/lib/privacy";
import { needLabel } from "@/lib/status";
import { qrDataUrl } from "@/lib/qr";
import { assignedPartnerIds } from "@/lib/partners";
import { ReportForm } from "@/app/ProofForms";
import { PrintButton } from "@/app/PrintButton";

export const dynamic = "force-dynamic";

const TRUCK: Record<string, string> = { yes: "可以進 17 噸大貨車", no: "大貨車進不去", unknown: "不確定大貨車能否進入" };

/** 夥伴看需求方的收貨資訊（電話只給被指派的夥伴）、列印 QR、代傳回報 */
export default async function PartnerNeed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, partnerIds } = await requirePartnerAccess();
  const need = await db.need.findUnique({
    where: { id },
    include: { org: true, items: { include: { inventory: { include: { donationItem: true } } } } },
  });
  if (!need) notFound();
  const assigned = await assignedPartnerIds(need.id);
  if (partnerIds && !partnerIds.some((p) => assigned.includes(p))) notFound();
  const showContact = canSeeContact(toViewer(user), { ownerUserId: need.requesterId, assignedPartnerIds: assigned });

  const units = need.items.flatMap((i) => i.inventory.filter((u) => u.status !== "in_stock"));
  const labels = await Promise.all(units.map(async (u) => ({ ...u, qr: await qrDataUrl(u.code) })));

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-2xl font-medium">{need.title}</h1>
        <p className="muted">
          {need.code}・{need.org.name}・{needLabel(need.status)}
        </p>
      </div>

      <section className="card no-print space-y-1 text-sm">
        <h2 className="mb-2 font-medium">收貨資訊</h2>
        <p>收貨地址：{need.deliveryAddress}</p>
        {need.deliveryAddress !== need.unitAddress && <p className="muted">單位地址：{need.unitAddress}</p>}
        {need.addressNote && <p>補充說明：{need.addressNote}</p>}
        <p>
          {TRUCK[need.truckAccess]}
          {need.receiveHours ? `・收貨時段：${need.receiveHours}` : ""}
        </p>
        {need.latestArrival && <p className="text-red-700">最晚到貨：{need.latestArrival.toLocaleDateString("zh-TW")}</p>}
        <p>
          手機：{showContact ? <a href={`tel:${need.mobile}`} className="text-brand-700">{need.mobile}</a> : maskPhone(need.mobile)}
          {need.landline && `・市話：${showContact ? need.landline : maskPhone(need.landline)}`}
        </p>
        {need.siteContactName && (
          <p>
            現場聯絡人：{need.siteContactName}
            {need.siteContactPhone && `（${showContact ? need.siteContactPhone : maskPhone(need.siteContactPhone)}）`}
          </p>
        )}
        <p className="muted">請優先透過好事道聯繫；聯絡不上時再打電話。</p>
      </section>

      {need.status === "awaiting_report" && (
        <section className="card no-print space-y-2">
          <h2 className="font-medium">代傳發放回報</h2>
          <p className="muted">需求方不方便操作時，可以由您代為上傳，紀錄上會標示「夥伴代傳」。</p>
          <ReportForm needId={need.id} />
        </section>
      )}

      {labels.length > 0 && (
        <section className="space-y-3">
          <div className="no-print flex items-center justify-between">
            <h2 className="font-medium">QR 標籤（{labels.length}）</h2>
            <PrintButton />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {labels.map((l) => (
              <div key={l.id} className="break-inside-avoid rounded border border-stone-400 p-3 text-center text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.qr} alt={l.code} className="mx-auto h-32 w-32" />
                <div className="font-mono text-sm">{l.code}</div>
                <div>{l.donationItem.name}</div>
                <div>送往：{need.org.name}</div>
                <div className="text-stone-500">{l.status === "delivered" ? "已收貨" : "收到時請掃描確認"}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
