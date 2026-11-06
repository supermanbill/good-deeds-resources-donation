import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { ReceiveForm } from "@/app/ProofForms";

export const dynamic = "force-dynamic";

/** 收貨方掃描箱上的 QR 碼後進入這頁 */
export default async function ReceivePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const unit = await db.inventoryUnit.findUnique({
    where: { code },
    include: { donationItem: true, needItem: { include: { need: { include: { org: true } } } } },
  });
  if (!unit) notFound();
  const user = await currentUser();
  const need = unit.needItem?.need;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-medium">收貨確認</h1>
      <div className="card space-y-1 text-sm">
        <p className="font-mono">{unit.code}</p>
        <p>物資：{unit.donationItem.name}</p>
        {need && <p>收件單位：{need.org.name}</p>}
        <p>
          狀態：
          {unit.status === "delivered"
            ? `已於 ${unit.deliveredAt?.toLocaleString("zh-TW")} 確認收貨`
            : unit.status === "shipped"
              ? "配送中"
              : "尚未出貨"}
        </p>
      </div>
      {unit.status === "delivered" && (
        <p className="rounded bg-brand-50 p-3 text-sm text-brand-900">
          已確認收貨，謝謝！全部到齊後，請到「我的好事」回報物資發放給哪些家庭或用在哪個活動。
        </p>
      )}
      {unit.status === "shipped" &&
        (user ? (
          <ReceiveForm code={code} />
        ) : (
          <Link href={`/join?next=/r/${code}`} className="btn w-full">
            登入好事道以確認收貨
          </Link>
        ))}
    </div>
  );
}
