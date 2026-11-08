import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { CATEGORY_RULES } from "@/lib/categories";
import { loadPartnersForAssign } from "@/lib/partners";
import { DonationForm } from "./DonationForm";

export const dynamic = "force-dynamic";

export default async function DonatePage({
  searchParams,
}: {
  searchParams: Promise<{ needItem?: string; campaign?: string }>;
}) {
  const sp = await searchParams;
  const [user, partners] = await Promise.all([currentUser(), loadPartnersForAssign()]);

  const needItem = sp.needItem
    ? await db.needItem.findUnique({ where: { id: sp.needItem }, include: { need: { include: { org: true } }, category: true } })
    : null;
  const campaign = sp.campaign ? await db.campaign.findUnique({ where: { slug: sp.campaign } }) : null;

  const claim =
    needItem && ["published", "partially_matched", "approved"].includes(needItem.need.status)
      ? {
          needItemId: needItem.id,
          categorySlug: needItem.category.slug,
          name: needItem.name,
          unit: needItem.unit,
          remaining: Math.max(1, needItem.quantity - needItem.fulfilled),
          title: needItem.need.title,
          org: needItem.need.org.name,
        }
      : null;

  // 到府收貨說明（列出提供到府的夥伴）
  const pickupNotes = await db.partner.findMany({
    where: { active: true, pickupMode: { not: "none" } },
    select: { name: true, pickupNote: true, pickupFeeNote: true, serviceAreas: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium">我要捐物資</h1>
        <p className="muted mt-1">
          請先登記，經執行夥伴評估確認後再安排運送。<strong>確認前請不要直接送貨。</strong>
        </p>
      </div>
      {claim && (
        <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
          您正在認領許願：{claim.org}「{claim.title}」— {claim.name}，還需要 {claim.remaining} {claim.unit}
        </div>
      )}
      {campaign?.status === "open" && (
        <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">這筆捐贈會計入活動：{campaign.title}</div>
      )}
      <DonationForm
        loggedIn={!!user}
        defaultContact={{ name: user?.name ?? "", phone: user?.phone ?? "", email: user?.email ?? "" }}
        rules={CATEGORY_RULES}
        partners={partners}
        claim={claim}
        campaignSlug={campaign?.status === "open" ? campaign.slug : ""}
        pickupNotes={pickupNotes.map((p) => ({
          name: p.name,
          note: [p.pickupNote, p.pickupFeeNote].filter(Boolean).join("；"),
          areas: JSON.parse(p.serviceAreas) as string[],
        }))}
      />
      <details className="card text-sm text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-800">捐物收據說明</summary>
        <p className="mt-2">
          捐物收據由執行夥伴（荃安）開立。依國稅局規定，實物捐贈的「捐物收據」只載明物資的品項與數量，不註明物資價值。若有報稅需求，請保留購買時的發票或收據，報稅時與捐物收據一起檢附。
        </p>
      </details>
    </div>
  );
}
