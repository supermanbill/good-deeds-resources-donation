import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePartnerAccess } from "@/lib/session";
import { qrDataUrl } from "@/lib/qr";
import { publicArea } from "@/lib/privacy";
import { PrintButton } from "@/app/PrintButton";

export const dynamic = "force-dynamic";

/** 每箱／每件一張 QR 標籤，貼在箱外（箱內也放一份） */
export default async function Labels({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { partnerIds } = await requirePartnerAccess();
  const d = await db.donation.findUnique({
    where: { id },
    include: { items: { include: { inventory: { include: { needItem: { include: { need: { include: { org: true } } } } } } } } },
  });
  if (!d || (partnerIds && (!d.partnerId || !partnerIds.includes(d.partnerId)))) notFound();

  const labels = await Promise.all(
    d.items.flatMap((it) =>
      it.inventory.map(async (u, idx) => ({
        code: u.code,
        item: it.name,
        seq: `${idx + 1}/${it.inventory.length}`,
        to: u.needItem ? `${u.needItem.need.org.name}・${publicArea(u.needItem.need.deliveryAddress)}` : "未分配",
        qr: await qrDataUrl(u.code),
      })),
    ),
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-xl font-medium">QR 標籤：{d.code}</h1>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {labels.map((l) => (
          <div key={l.code} className="break-inside-avoid rounded border border-stone-400 p-3 text-center text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={l.qr} alt={l.code} className="mx-auto h-32 w-32" />
            <div className="mt-1 font-mono text-sm">{l.code}</div>
            <div>
              {l.item}（{l.seq}）
            </div>
            <div>送往：{l.to}</div>
            <div className="mt-1 text-stone-500">收到時請用手機掃描確認收貨</div>
          </div>
        ))}
      </div>
    </div>
  );
}
