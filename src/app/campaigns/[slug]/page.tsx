import Link from "next/link";
import { notFound } from "next/navigation";
import { db, parseJson } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await db.campaign.findUnique({ where: { slug } });
  if (!c || c.status === "draft") notFound();
  const tiers = parseJson<{ amount: number; label: string }[]>(c.donationTiers, []);
  const open = c.status === "open";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <span className="badge">{open ? "募集中" : "已結束"}</span>
        <h1 className="mt-2 text-2xl font-medium">{c.title}</h1>
        <p className="muted">
          {c.startsAt.toLocaleDateString("zh-TW")} – {c.endsAt.toLocaleDateString("zh-TW")}
        </p>
      </div>
      <p className="text-stone-700">{c.summary}</p>
      <div className="card whitespace-pre-line text-sm text-stone-700">{c.description}</div>

      {open && (
        <div className="flex flex-wrap gap-3">
          <Link href={`/donate?campaign=${c.slug}`} className="btn">
            我要捐贈
          </Link>
          <Link href={`/needs/new?campaign=${c.slug}`} className="btn-outline">
            我們的單位想申請
          </Link>
        </div>
      )}

      {tiers.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-medium">捐款金額對照（含物流、行政、佈置與企業影響力看板）</h2>
          <table className="w-full text-sm">
            <tbody>
              {tiers.map((t) => (
                <tr key={t.amount} className="border-t first:border-0">
                  <td className="py-1.5">NT$ {t.amount.toLocaleString("zh-TW")}</td>
                  <td className="py-1.5 text-right">{t.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href={`/give?purpose=campaign&campaign=${c.slug}`} className="btn mt-3">
            前往捐款
          </Link>
        </section>
      )}
    </div>
  );
}
