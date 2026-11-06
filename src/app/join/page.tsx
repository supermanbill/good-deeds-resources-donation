import Link from "next/link";
import { loginUrl } from "@/lib/session";

/** 加入好事道說明頁（文案見 需求決策紀錄） */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/me" } = await searchParams;
  const login = loginUrl(next);
  const fromForm = next.startsWith("/donate") || next.startsWith("/needs") || next.startsWith("/wishes");

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {fromForm && (
        <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">
          您填的資料已經暫存。加入或登入好事道之後，會自動回到剛剛的表單，按「送出」就完成了。
        </div>
      )}

      <section className="space-y-2">
        <h1 className="text-2xl font-medium">加入好事道，讓您的每一份善意都被看見</h1>
        <p className="text-stone-600">從您捐出物資的那一刻起，到它被送到哪一個家庭，全程都看得到。</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Benefit title="即時知道進度，不必等電話">
          審核通過、司機出發、物資入倉、送到偏鄉，每一步都會在好事道即時通知您。
        </Benefit>
        <Benefit title="一個地方就能聯絡所有人">
          協會、物流夥伴、收到物資的教會或單位，都在同一個對話裡，訊息不會漏掉。
        </Benefit>
        <Benefit title="您的「好事履歷」">
          捐了什麼、送到哪裡、收到的人怎麼使用，附上現場照片，日後隨時可以回顧。
        </Benefit>
        <Benefit title="看得見的影響力">
          送達紀錄會整理成影響力數字。企業會員可以直接用來當作 ESG 與永續報告的素材。
        </Benefit>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">為什麼我們請您加入？</h2>
        <p className="text-stone-600">
          好事公益協會是一個小協會，每一通確認電話都是人力成本。您透過好事道和我們聯繫，省下的人事費和電話費，就能多付一趟送往偏鄉的運費。
        </p>
        <h2 className="pt-2 font-medium">您的資料怎麼保護</h2>
        <p className="text-stone-600">
          電話和地址只提供給負責您這筆物資的服務人員和司機，不會公開在網站上，也不會用在其他用途。
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href={login} className="btn">
          立即加入好事道
        </Link>
        <Link href={login} className="btn-outline">
          已經是會員，登入
        </Link>
      </div>

      <section className="space-y-3 text-sm">
        <h2 className="text-base font-medium">常見問題</h2>
        <Faq q="家裡長輩不會用怎麼辦？">可以由家人代為註冊，或是打電話請協會協助登記。</Faq>
        <Faq q="企業可以用公司名義加入嗎？">可以，加入後可以新增多位同事一起管理。</Faq>
        <Faq q="一定要下載 App 嗎？">用手機瀏覽器就能登記和查看進度；安裝好事道 App 可以即時收到通知。</Faq>
      </section>
    </div>
  );
}

function Benefit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="mb-1 font-medium text-brand-700">{title}</h3>
      <p className="text-sm text-stone-600">{children}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-medium">{q}</div>
      <div className="text-stone-600">{children}</div>
    </div>
  );
}
