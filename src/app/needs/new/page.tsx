import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { NeedForm } from "./NeedForm";

export const dynamic = "force-dynamic";

export default async function NewNeedPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign: slug } = await searchParams;
  const user = await requireUser(slug ? `/needs/new?campaign=${slug}` : "/needs/new");
  const [categories, campaign] = await Promise.all([
    db.category.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    slug ? db.campaign.findUnique({ where: { slug } }) : null,
  ]);
  const open = campaign?.status === "open";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium">{open ? `申請活動物資：${campaign!.title}` : "我要提需求（許願）"}</h1>
        <p className="muted mt-1">
          {open
            ? "填寫單位資料與需要的物資，好事公益協會審核後會跟您約定到貨時間。"
            : "還不確定有沒有物資也可以先許願。審核通過後會公開在許願池，讓捐贈者認領。"}
        </p>
      </div>
      <NeedForm
        hasOrg={!!user.org}
        orgName={user.org?.name ?? ""}
        defaultAddress={user.org?.address ?? ""}
        defaultMobile={user.phone ?? ""}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        campaignSlug={open ? campaign!.slug : ""}
      />
    </div>
  );
}
