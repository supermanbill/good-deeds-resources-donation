import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { donationLabel, needLabel } from "@/lib/status";
import { ReportForm } from "@/app/ProofForms";
import { reconfirm } from "../actions/receive";

export const dynamic = "force-dynamic";

export default async function MePage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const { submitted } = await searchParams;
  const user = await requireUser("/me");

  const [donations, needs, inbox] = await Promise.all([
    db.donation.findMany({ where: { donorId: user.id }, include: { items: true }, orderBy: { createdAt: "desc" } }),
    db.need.findMany({
      where: user.orgId ? { OR: [{ requesterId: user.id }, { orgId: user.orgId }] } : { requesterId: user.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    }),
    db.chatMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  // 看過就算已讀（mock 模式；正式模式由好事道回報已讀）
  await db.chatMessage.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });

  // 好事履歷：送達與結案的捐贈，以及受益戶數
  const doneDonations = donations.filter((d) => ["delivered", "closed"].includes(d.status));
  const proofs = await db.proof.findMany({
    where: { kind: "distributed", need: { items: { some: { inventory: { some: { donationItem: { donation: { donorId: user.id } } } } } } } },
  });
  const households = proofs.reduce((s, p) => s + (p.householdCount ?? 0), 0);
  const now = new Date();

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium">我的好事｜{user.name}</h1>
      {submitted && <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">已送出 {submitted}，審核結果會在好事道通知您。</div>}

      <section className="grid grid-cols-3 gap-3 text-center">
        <Stat n={donations.length} label="次捐贈登記" />
        <Stat n={doneDonations.length} label="次已送達" />
        <Stat n={households} label="戶家庭受益" />
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">我的捐贈</h2>
        {donations.length === 0 && (
          <p className="muted">
            還沒有捐贈紀錄。<Link href="/donate" className="text-brand-700">登記第一筆</Link>
          </p>
        )}
        {donations.map((d) => (
          <div key={d.id} className="card flex flex-wrap items-center justify-between gap-2 !p-4">
            <div>
              <div className="font-medium">{d.items.map((i) => i.name).join("、")}</div>
              <div className="muted">
                {d.code}・{d.createdAt.toLocaleDateString("zh-TW")}
              </div>
            </div>
            <span className="badge">{donationLabel(d.status)}</span>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">我們的需求</h2>
        {needs.length === 0 && (
          <p className="muted">
            沒有需求紀錄。<Link href="/needs/new" className="text-brand-700">提出需求</Link>
          </p>
        )}
        {needs.map((n) => {
          const reviewDue = n.frequency !== "once" && (n.status === "paused" || (n.nextReviewAt && n.nextReviewAt.getTime() - now.getTime() < 14 * 86_400_000));
          return (
            <div key={n.id} className="card space-y-3 !p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{n.title}</div>
                  <div className="muted">
                    {n.code}・{n.type === "wish" ? "許願" : "活動申請"}・
                    {n.items.map((i) => `${i.name} ${Math.min(i.fulfilled, i.quantity)}/${i.quantity}${i.unit}`).join("、")}
                  </div>
                </div>
                <span className="badge">{needLabel(n.status)}</span>
              </div>
              {reviewDue && n.status !== "closed" && (
                <form action={reconfirm} className="flex flex-wrap items-center gap-3 rounded bg-amber-50 p-3 text-sm text-amber-900">
                  <input type="hidden" name="needId" value={n.id} />
                  <span>這是定期需求，請確認還需要嗎？</span>
                  <button className="btn !py-1">還需要，繼續公開</button>
                </form>
              )}
              {n.status === "awaiting_report" && (
                <div className="border-t pt-3">
                  <h3 className="mb-2 text-sm font-medium">回報物資發放情形</h3>
                  <ReportForm needId={n.id} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">好事道訊息</h2>
        <p className="muted">開發模式下，這裡模擬好事道聊天收到的進度通知。</p>
        {inbox.length === 0 && <p className="muted">沒有訊息</p>}
        <ul className="space-y-2">
          {inbox.map((m) => (
            <li key={m.id} className="card !p-3 text-sm">
              <div className="muted mb-1">
                {m.threadKey}・{m.createdAt.toLocaleString("zh-TW")}
                {!m.readAt && <span className="ml-2 text-red-700">新</span>}
              </div>
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="card !p-4">
      <div className="text-2xl font-medium text-brand-700">{n}</div>
      <div className="muted">{label}</div>
    </div>
  );
}
