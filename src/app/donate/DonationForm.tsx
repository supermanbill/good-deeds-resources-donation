"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryRule, CategorySlug } from "@/lib/categories";
import { depotOptions, type PartnerForAssign } from "@/lib/assign";
import { submitDonation, type DonationPayload } from "../actions/donations";

interface Item {
  key: string;
  categorySlug: CategorySlug;
  name: string;
  quantity: number;
  unit: string;
  condition: string;
  usageYears: string;
  expiryDate: string;
  confirmations: Record<string, boolean>;
  photos: { id: string; url: string }[];
  needItemId?: string | null;
}

interface Draft {
  donorType: "individual" | "company";
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  logistics: "self_dropoff" | "pickup";
  depotId: string;
  pickupAddress: string;
  hasElevator: "yes" | "no" | "unknown";
  groundSteps: "yes" | "no" | "unknown";
  floor: string;
  showOnWall: boolean;
  wantsReceipt: boolean;
  agreedTerms: boolean;
  items: Item[];
}

const DRAFT_KEY = "gd-donation-draft";

function newItem(slug: CategorySlug, extra: Partial<Item> = {}): Item {
  return {
    key: Math.random().toString(36).slice(2),
    categorySlug: slug,
    name: "",
    quantity: 1,
    unit: "件",
    condition: "",
    usageYears: "",
    expiryDate: "",
    confirmations: {},
    photos: [],
    ...extra,
  };
}

export function DonationForm(props: {
  loggedIn: boolean;
  defaultContact: { name: string; phone: string; email: string };
  rules: Record<CategorySlug, CategoryRule>;
  partners: PartnerForAssign[];
  claim: null | { needItemId: string; categorySlug: string; name: string; unit: string; remaining: number };
  campaignSlug: string;
  pickupNotes: { name: string; note: string; areas: string[] }[];
}) {
  const router = useRouter();
  const slugs = Object.keys(props.rules) as CategorySlug[];
  const initial: Draft = {
    donorType: "individual",
    contactName: props.defaultContact.name,
    contactPhone: props.defaultContact.phone,
    contactEmail: props.defaultContact.email,
    logistics: "self_dropoff",
    depotId: "",
    pickupAddress: "",
    hasElevator: "unknown",
    groundSteps: "unknown",
    floor: "",
    showOnWall: false,
    wantsReceipt: false,
    agreedTerms: false,
    items: [
      props.claim
        ? newItem(props.claim.categorySlug as CategorySlug, {
            name: props.claim.name,
            unit: props.claim.unit,
            quantity: props.claim.remaining,
            needItemId: props.claim.needItemId,
          })
        : newItem(props.campaignSlug ? "new_gift" : "furniture"),
    ],
  };
  const [d, setD] = useState<Draft>(initial);
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { code: string; partnerName: string | null }>(null);

  // 還原暫存（登入前填的內容）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Draft & { claimId?: string; campaignSlug?: string };
        const sameContext = (saved.claimId ?? null) === (props.claim?.needItemId ?? null) && (saved.campaignSlug ?? "") === props.campaignSlug;
        if (sameContext) {
          // 登入前沒填的聯絡資料，用好事道會員資料補上
          setD({
            ...saved,
            contactName: saved.contactName || props.defaultContact.name,
            contactPhone: saved.contactPhone || props.defaultContact.phone,
            contactEmail: saved.contactEmail || props.defaultContact.email,
          });
          setRestored(true);
        }
      }
    } catch {
      /* 暫存壞掉就忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDraft = (draft: Draft) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, claimId: props.claim?.needItemId ?? null, campaignSlug: props.campaignSlug }));
    } catch {
      /* 無法使用 localStorage 時不暫存 */
    }
  };

  const update = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const updateItem = (key: string, patch: Partial<Item>) =>
    setD((prev) => ({ ...prev, items: prev.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));

  const selectedSlugs = useMemo(() => [...new Set(d.items.map((i) => i.categorySlug))], [d.items]);
  const depots = useMemo(() => depotOptions(props.partners, selectedSlugs), [props.partners, selectedSlugs]);

  useEffect(() => {
    if (d.logistics === "self_dropoff" && depots.length && !depots.some((o) => o.depotId === d.depotId)) {
      update({ depotId: depots[0].depotId });
    }
  }, [depots, d.logistics, d.depotId]);

  async function upload(key: string, files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) {
      setErrors([json.error ?? "上傳失敗"]);
      return;
    }
    setD((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, photos: [...i.photos, ...json.photos] } : i)),
    }));
  }

  async function submit() {
    setErrors([]);
    setBusy(true);
    saveDraft(d);
    const payload: DonationPayload = {
      ...d,
      campaignSlug: props.campaignSlug,
      agreedTerms: d.agreedTerms as true,
      items: d.items.map(({ key: _k, photos, ...rest }) => ({ ...rest, photoIds: photos.map((p) => p.id) })),
    };
    try {
      const r = await submitDonation(payload);
      if (r.ok) {
        localStorage.removeItem(DRAFT_KEY);
        setDone({ code: r.code, partnerName: r.partnerName });
        window.scrollTo(0, 0);
      } else if (r.needLogin) {
        const next = window.location.pathname + window.location.search;
        router.push(`/join?next=${encodeURIComponent(next)}`);
      } else {
        setErrors(r.errors);
      }
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card space-y-3">
        <h2 className="text-lg font-medium text-brand-700">登記完成，謝謝您！</h2>
        <p>
          捐贈單號：<strong>{done.code}</strong>
        </p>
        <p className="text-sm text-stone-600">
          {done.partnerName
            ? `已交給「${done.partnerName}」審核。審核結果與後續送貨安排，會透過好事道通知您。`
            : "我們正在安排適合的執行夥伴，會再透過好事道通知您。"}
        </p>
        <p className="text-sm text-stone-600">到府收貨與送往偏鄉的運費、人事費，都需要大家支持。</p>
        <div className="flex flex-wrap gap-3">
          <a href="/give?purpose=logistics" className="btn">
            捐款支持運費
          </a>
          <a href="/me" className="btn-outline">
            查看我的捐贈進度
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {restored && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">已幫您帶回剛剛填寫的內容。</div>}

      <section className="card space-y-4">
        <h2 className="font-medium">1. 捐贈者資料</h2>
        <Radio
          value={d.donorType}
          onChange={(v) => update({ donorType: v as Draft["donorType"] })}
          options={[
            ["individual", "個人"],
            ["company", "企業／組織"],
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="聯絡人姓名">
            <input className="input" value={d.contactName} onChange={(e) => update({ contactName: e.target.value })} />
          </Field>
          <Field label="聯絡電話">
            <input className="input" value={d.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={d.contactEmail} onChange={(e) => update({ contactEmail: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">2. 捐贈物資</h2>
        {d.items.map((it, idx) => {
          const rule = props.rules[it.categorySlug];
          return (
            <div key={it.key} className="space-y-3 rounded-lg border border-stone-200 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">第 {idx + 1} 項</span>
                {d.items.length > 1 && !it.needItemId && (
                  <button className="text-sm text-red-700" onClick={() => update({ items: d.items.filter((x) => x.key !== it.key) })}>
                    刪除
                  </button>
                )}
              </div>
              <Field label="品類">
                <select
                  className="input"
                  value={it.categorySlug}
                  disabled={!!it.needItemId}
                  onChange={(e) => updateItem(it.key, { categorySlug: e.target.value as CategorySlug, confirmations: {} })}
                >
                  {slugs.map((s) => (
                    <option key={s} value={s}>
                      {props.rules[s].name}
                    </option>
                  ))}
                </select>
                <p className="muted mt-1">{rule.summary}</p>
              </Field>
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem]">
                <Field label="物資名稱">
                  <input className="input" value={it.name} onChange={(e) => updateItem(it.key, { name: e.target.value })} placeholder="例如：三人座沙發" />
                </Field>
                <Field label="數量">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => updateItem(it.key, { quantity: Number(e.target.value) })}
                  />
                </Field>
                <Field label="單位">
                  <input className="input" value={it.unit} onChange={(e) => updateItem(it.key, { unit: e.target.value })} />
                </Field>
              </div>
              {rule.requiresUsageYears && (
                <Field label="大約使用年限">
                  <input className="input" value={it.usageYears} onChange={(e) => updateItem(it.key, { usageYears: e.target.value })} placeholder="例如：3 年" />
                </Field>
              )}
              {rule.requiresExpiry && (
                <Field label="有效期限（最早的一批）">
                  <input className="input" type="date" value={it.expiryDate} onChange={(e) => updateItem(it.key, { expiryDate: e.target.value })} />
                </Field>
              )}
              <Field label="狀況說明（選填）">
                <textarea className="input" rows={2} value={it.condition} onChange={(e) => updateItem(it.key, { condition: e.target.value })} />
              </Field>
              {rule.confirmations.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!it.confirmations[c.key]}
                    onChange={(e) => updateItem(it.key, { confirmations: { ...it.confirmations, [c.key]: e.target.checked } })}
                  />
                  {c.label}
                </label>
              ))}
              <div>
                <span className="label">
                  照片（至少 {rule.minPhotos} 張）：{rule.photoHint}
                </span>
                <input type="file" accept="image/*,video/mp4,video/quicktime" multiple onChange={(e) => upload(it.key, e.target.files)} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.photos.map((p) => (
                    <div key={p.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-20 w-20 rounded object-cover" />
                      <button
                        className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-xs shadow"
                        onClick={() => updateItem(it.key, { photos: it.photos.filter((x) => x.id !== p.id) })}
                        aria-label="移除照片"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p className="muted mt-1">已選擇 {it.photos.length} 張</p>
              </div>
            </div>
          );
        })}
        {!props.claim && (
          <button className="btn-outline" onClick={() => update({ items: [...d.items, newItem(d.items.at(-1)?.categorySlug ?? "furniture")] })}>
            ＋ 再加一項
          </button>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">3. 運送方式</h2>
        <Radio
          value={d.logistics}
          onChange={(v) => update({ logistics: v as Draft["logistics"] })}
          options={[
            ["self_dropoff", "自行送到集貨點"],
            ["pickup", "請執行夥伴到府收貨"],
          ]}
        />
        {d.logistics === "self_dropoff" ? (
          depots.length ? (
            <Field label="集貨點">
              <select className="input" value={d.depotId} onChange={(e) => update({ depotId: e.target.value })}>
                {depots.map((o) => (
                  <option key={o.depotId} value={o.depotId}>
                    {o.depotName}（{o.partnerName}）— {o.address}
                  </option>
                ))}
              </select>
              <p className="muted mt-1">從您家到集貨點的運費由您負擔；從集貨點送到偏鄉的費用由我們負責。</p>
            </Field>
          ) : (
            <p className="text-sm text-red-700">目前沒有集貨點可以同時收這些品類，請分開登記或改選到府收貨。</p>
          )
        ) : (
          <div className="space-y-3">
            <Field label="收貨地址">
              <input className="input" value={d.pickupAddress} onChange={(e) => update({ pickupAddress: e.target.value })} placeholder="例如：台北市大安區…" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="有沒有電梯">
                <YesNo value={d.hasElevator} onChange={(v) => update({ hasElevator: v })} />
              </Field>
              <Field label="1 樓有沒有階梯">
                <YesNo value={d.groundSteps} onChange={(v) => update({ groundSteps: v })} />
              </Field>
              <Field label="樓層">
                <input className="input" value={d.floor} onChange={(e) => update({ floor: e.target.value })} />
              </Field>
            </div>
            <div className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
              {props.pickupNotes.map((p) => (
                <p key={p.name}>
                  {p.name}：{p.note}（服務範圍：{p.areas.join("、")}）
                </p>
              ))}
              <p className="mt-1">審核通過後，執行夥伴會在好事道跟您確認運費與收貨時間。</p>
            </div>
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">4. 其他</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.showOnWall} onChange={(e) => update({ showOnWall: e.target.checked })} />
          通過審核後，可以公開在「物資展示牆」讓需要的單位申請
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.wantsReceipt} onChange={(e) => update({ wantsReceipt: e.target.checked })} />
          需要捐物收據
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.agreedTerms} onChange={(e) => update({ agreedTerms: e.target.checked })} />
          我已閱讀並同意捐贈條款：物資由執行夥伴評估後決定是否收件，不合適或暫時沒有需求時可能婉拒；收件後物資的分配由平台與執行夥伴決定。
        </label>
      </section>

      {errors.length > 0 && (
        <ul className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {errors.map((e) => (
            <li key={e}>・{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={busy} onClick={submit}>
          {busy ? "送出中…" : props.loggedIn ? "送出捐贈資訊" : "送出（需要加入好事道）"}
        </button>
        {!props.loggedIn && <span className="muted">送出時會請您加入或登入好事道，填好的內容會先暫存。</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Radio({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {options.map(([v, l]) => (
        <label key={v} className="flex items-center gap-2">
          <input type="radio" checked={value === v} onChange={() => onChange(v)} />
          {l}
        </label>
      ))}
    </div>
  );
}

function YesNo({ value, onChange }: { value: "yes" | "no" | "unknown"; onChange: (v: "yes" | "no" | "unknown") => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as "yes" | "no" | "unknown")}>
      <option value="yes">有</option>
      <option value="no">沒有</option>
      <option value="unknown">不確定</option>
    </select>
  );
}
