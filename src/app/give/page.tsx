const PURPOSES: Record<string, { title: string; text: string }> = {
  logistics: { title: "物流費", text: "到府收貨、從集貨點送往偏鄉的貨車運費。17 噸貨車北部到花蓮一趟約 2.5 萬元。" },
  staff: { title: "人事費", text: "審核、倉儲整理、分類包裝、聯繫與配送協調的工作人員費用。" },
  warehouse: { title: "倉儲費", text: "集貨倉庫的租金與包材。" },
  campaign: { title: "活動費用", text: "活動的物流、行政、佈置與企業影響力看板。" },
  general: { title: "一般捐款", text: "由協會依各項需求統籌運用，每一筆支出都會公開在好事道。" },
};

export default async function GivePage({ searchParams }: { searchParams: Promise<{ purpose?: string; campaign?: string }> }) {
  const { purpose = "general", campaign } = await searchParams;
  const p = PURPOSES[purpose] ?? PURPOSES.general;
  const base = process.env.DONATION_URL;
  const url = base ? `${base}${base.includes("?") ? "&" : "?"}purpose=${purpose}${campaign ? `&campaign=${campaign}` : ""}` : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium">捐款支持物資送到偏鄉</h1>
        <p className="muted mt-1">受款單位：社團法人好事公益協會。捐款收據由協會開立。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(PURPOSES).map(([k, v]) => (
          <a key={k} href={`/give?purpose=${k}${campaign ? `&campaign=${campaign}` : ""}`} className={`card block ${k === purpose ? "border-brand-600" : ""}`}>
            <div className="font-medium">{v.title}</div>
            <div className="muted mt-1">{v.text}</div>
          </a>
        ))}
      </div>
      <div className="card space-y-3">
        <p>
          您選擇：<strong>{p.title}</strong>
        </p>
        {url ? (
          <a href={url} className="btn" target="_blank" rel="noopener">
            前往捐款頁面
          </a>
        ) : (
          <p className="text-sm text-amber-800">捐款連結尚未設定（請在環境變數 DONATION_URL 填入好事公益協會的金流捐款頁）。</p>
        )}
      </div>
    </div>
  );
}
