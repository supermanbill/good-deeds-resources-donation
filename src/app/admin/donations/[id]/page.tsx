import { notFound } from "next/navigation";
import { db, parseJson } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { donationLabel } from "@/lib/status";
import { assignDonationPartner } from "../../../actions/admin";

export const dynamic = "force-dynamic";

/** 平台管理員手動分派（或改派）執行夥伴 */
export default async function AdminDonation({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const d = await db.donation.findUnique({ where: { id }, include: { items: { include: { category: true } }, partner: true } });
  if (!d) notFound();
  const partners = await db.partner.findMany({ where: { active: true }, include: { categories: true } });
  const needCats = [...new Set(d.items.map((i) => i.categoryId))];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-medium">分派捐贈 {d.code}</h1>
      <div className="card space-y-1 text-sm">
        <p>狀態：{donationLabel(d.status)}</p>
        <p>物資：{d.items.map((i) => `${i.name}（${i.category.name}）`).join("、")}</p>
        <p>運送：{d.logistics === "pickup" ? `到府收貨・${d.pickupAddress}` : "自行送達"}</p>
        <p>目前夥伴：{d.partner?.name ?? "尚未分派"}</p>
      </div>
      <form action={assignDonationPartner} className="card space-y-3">
        <input type="hidden" name="donationId" value={d.id} />
        <span className="label">指派給</span>
        <select name="partnerId" className="input">
          {partners.map((p) => {
            const ok = needCats.every((c) => p.categories.some((pc) => pc.categoryId === c));
            return (
              <option key={p.id} value={p.id}>
                {p.name}
                {ok ? "" : "（不收部分品類）"}・到府範圍：{parseJson<string[]>(p.serviceAreas, []).join("、") || "無"}
              </option>
            );
          })}
        </select>
        <button className="btn">確認分派</button>
      </form>
    </div>
  );
}
