import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({ where: { status: { in: ["open", "closed"] } }, orderBy: { endsAt: "desc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium">專案活動</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/campaigns/${c.slug}`} className="card block hover:border-brand-600">
            <span className="badge mb-2">{c.status === "open" ? "募集中" : "已結束"}</span>
            <h2 className="font-medium">{c.title}</h2>
            <p className="muted mt-1">{c.summary}</p>
            <p className="muted mt-2">
              {c.startsAt.toLocaleDateString("zh-TW")} – {c.endsAt.toLocaleDateString("zh-TW")}
            </p>
          </Link>
        ))}
        {campaigns.length === 0 && <p className="muted">目前沒有活動。</p>}
      </div>
    </div>
  );
}
