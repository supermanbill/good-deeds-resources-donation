"use client";

import { useState } from "react";
import { confirmReceipt, submitReport, type ActionResult } from "./actions/receive";

async function uploadAll(files: FileList | null): Promise<string[]> {
  if (!files?.length) return [];
  const fd = new FormData();
  for (const f of Array.from(files)) fd.append("files", f);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "上傳失敗");
  return (json.photos as { id: string }[]).map((p) => p.id);
}

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return r.ok ? (
    <p className="rounded bg-brand-50 p-3 text-sm text-brand-900">{r.message}</p>
  ) : (
    <p className="rounded bg-red-50 p-3 text-sm text-red-800">{r.error}</p>
  );
}

/** 掃 QR 碼後的收貨確認 */
export function ReceiveForm({ code }: { code: string }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<ActionResult | null>(null);

  async function go() {
    setBusy(true);
    try {
      setR(await confirmReceipt(code, note, await uploadAll(files)));
    } catch (e) {
      setR({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (r?.ok) return <Result r={r} />;
  return (
    <div className="space-y-3">
      <div>
        <span className="label">拍一張物資抵達的照片</span>
        <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles(e.target.files)} />
      </div>
      <textarea className="input" rows={2} placeholder="想說的話（選填）" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn w-full" disabled={busy} onClick={go}>
        {busy ? "確認中…" : "確認收貨"}
      </button>
      <Result r={r} />
    </div>
  );
}

/** 發放回報：送給哪些家庭、用在哪個活動 */
export function ReportForm({ needId }: { needId: string }) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [households, setHouseholds] = useState("");
  const [occasion, setOccasion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<ActionResult | null>(null);

  async function go() {
    setBusy(true);
    try {
      const n = Number(households);
      setR(
        await submitReport(needId, {
          householdCount: Number.isInteger(n) && n > 0 ? n : null,
          occasion,
          note,
          photoIds: await uploadAll(files),
        }),
      );
    } catch (e) {
      setR({ ok: false, error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (r?.ok) return <Result r={r} />;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="label">送給幾戶家庭</span>
          <input className="input" type="number" min={1} value={households} onChange={(e) => setHouseholds(e.target.value)} />
        </div>
        <div>
          <span className="label">用在哪個活動或節日</span>
          <input className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="例如：聖誕晚會" />
        </div>
      </div>
      <p className="muted">為了保護隱私，請不要填寫受助家庭的姓名或地址。</p>
      <div>
        <span className="label">發放現場照片（至少 1 張）</span>
        <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
      </div>
      <textarea className="input" rows={3} placeholder="想跟捐贈者說的話" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn" disabled={busy} onClick={go}>
        {busy ? "送出中…" : "送出發放回報"}
      </button>
      <Result r={r} />
    </div>
  );
}
