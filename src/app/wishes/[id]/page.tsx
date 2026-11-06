import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { publicArea } from "@/lib/privacy";
import { needLabel } from "@/lib/status";
import { photoUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function WishDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const need = await db.need.findUnique({
    where: { id },
    include: { org: true, items: { include: { category: true } }, proofs: { include: { photos: true } } },
  });
  if (!need || need.type !== "wish" || ["submitted", "reviewing", "rejected"].includes(need.status)) notFound();
  const open = ["published", "partially_matched"].includes(need.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span className="badge">{needLabel(need.status)}</span>
          {need.frequency !== "once" && <span className="badge">{need.frequency === "monthly" ? "每月需要" : "每季需要"}</span>}
          {need.deadline && <span className="badge">{need.deadline.toLocaleDateString("zh-TW")} 前</span>}
        </div>
        <h1 className="text-2xl font-medium">{need.title}</h1>
        <p className="muted">
          {need.org.name}・{publicArea(need.deliveryAddress)}
          {need.peopleCount ? `・受益約 ${need.peopleCount} 人` : ""}
        </p>
      </div>

      <p className="whitespace-pre-line text-stone-700">{need.description}</p>

      <section className="card space-y-4">
        <h2 className="font-medium">需要的物資</h2>
        {need.items.map((i) => {
          const remain = Math.max(0, i.quantity - i.fulfilled);
          return (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-0 first:pt-0">
              <div>
                <div className="font-medium">{i.name}</div>
                <div className="muted">
                  {i.category.name}・還需要 {remain} / {i.quantity} {i.unit}
                </div>
              </div>
              {open && remain > 0 && (
                <Link href={`/donate?needItem=${i.id}`} className="btn">
                  我來捐
                </Link>
              )}
            </div>
          );
        })}
      </section>

      {need.proofs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">送達與發放紀錄</h2>
          {need.proofs.map((p) => (
            <div key={p.id} className="card space-y-2">
              <div className="muted">
                {p.kind === "received" ? "收貨確認" : "發放回報"}・{p.createdAt.toLocaleDateString("zh-TW")}
                {p.householdCount ? `・${p.householdCount} 戶` : ""}
                {p.occasion ? `・${p.occasion}` : ""}
              </div>
              {p.note && <p className="text-sm">{p.note}</p>}
              <div className="flex flex-wrap gap-2">
                {p.photos.map((ph) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={ph.id} src={photoUrl(ph.fileName)} alt="" className="h-24 w-24 rounded object-cover" />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
