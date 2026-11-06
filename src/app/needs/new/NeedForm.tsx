"use client";

import { useActionState } from "react";
import { submitNeed } from "../../actions/needs";

export function NeedForm(props: {
  hasOrg: boolean;
  orgName: string;
  defaultAddress: string;
  defaultMobile: string;
  categories: { slug: string; name: string }[];
  campaignSlug: string;
}) {
  const [state, action, pending] = useActionState(submitNeed, null);
  const isWish = !props.campaignSlug;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="campaignSlug" value={props.campaignSlug} />

      <section className="card space-y-4">
        <h2 className="font-medium">1. 申請單位</h2>
        {props.hasOrg ? (
          <p>{props.orgName}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="單位名稱">
              <input name="orgName" className="input" required />
            </F>
            <F label="單位類型">
              <select name="orgType" className="input" defaultValue="church">
                <option value="church">教會</option>
                <option value="ngo">NGO／協會</option>
                <option value="village">村長辦公室</option>
                <option value="household">個人家庭</option>
              </select>
            </F>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">2. 需求內容</h2>
        <F label="標題">
          <input name="title" className="input" required placeholder={isWish ? "例如：兒童課輔班需要一台鋼琴" : "例如：聖誕晚會孩子禮物"} />
        </F>
        <F label="用途與受益對象">
          <textarea name="description" className="input" rows={3} required placeholder="例如：部落有 12 位臥床長者，每月需要尿布" />
        </F>
        <div className="grid gap-3 sm:grid-cols-3">
          <F label="受益人數（約）">
            <input name="peopleCount" type="number" min={1} className="input" />
          </F>
          {isWish && (
            <F label="需求頻率">
              <select name="frequency" className="input" defaultValue="once">
                <option value="once">一次性</option>
                <option value="monthly">每月</option>
                <option value="quarterly">每季</option>
              </select>
            </F>
          )}
          <F label="希望在這天前收到">
            <input name="deadline" type="date" className="input" />
          </F>
        </div>
        <div className="space-y-2">
          <span className="label">需要的物資（最多 5 項）</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_5rem_5rem]">
              <select name={`item_${i}_category`} className="input" defaultValue={props.campaignSlug ? "new_gift" : props.categories[0]?.slug}>
                {props.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input name={`item_${i}_name`} className="input" placeholder={i === 0 ? "物資名稱，例如：成人紙尿褲" : "物資名稱（選填）"} required={i === 0} />
              <input name={`item_${i}_quantity`} type="number" min={1} defaultValue={1} className="input" aria-label="數量" />
              <input name={`item_${i}_unit`} className="input" defaultValue="件" aria-label="單位" />
            </div>
          ))}
          {isWish && <p className="muted">定期需求每 3 個月會請您重新確認一次，確保需求仍然存在。</p>}
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-medium">3. 收貨資訊</h2>
        <F label="單位地址">
          <input name="unitAddress" className="input" defaultValue={props.defaultAddress} required />
        </F>
        <F label="收貨地址（跟單位地址不同時才填）">
          <input name="deliveryAddress" className="input" placeholder="例如：山區道路常坍方，改送到山下的親友家" />
        </F>
        <F label="地址補充說明">
          <input name="addressNote" className="input" placeholder="例如：從台 30 線轉進來，教會在活動中心旁" />
        </F>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="手機（必填，送貨聯絡用）">
            <input name="mobile" className="input" defaultValue={props.defaultMobile} required />
          </F>
          <F label="市話">
            <input name="landline" className="input" />
          </F>
          <F label="現場聯絡人">
            <input name="siteContactName" className="input" placeholder="例如：師母、幹事" />
          </F>
          <F label="現場聯絡人電話">
            <input name="siteContactPhone" className="input" />
          </F>
          <F label="17 噸大貨車能不能開到">
            <select name="truckAccess" className="input" defaultValue="unknown">
              <option value="yes">可以</option>
              <option value="no">不行</option>
              <option value="unknown">不確定</option>
            </select>
          </F>
          <F label="可收貨時段">
            <input name="receiveHours" className="input" placeholder="例如：週一至週五上午" />
          </F>
          <F label="最晚到貨日（有活動日期時填）">
            <input name="latestArrival" type="date" className="input" />
          </F>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="transitHub" />
          願意當「區域轉運點」，協助附近的小型教會或單位領取物資
        </label>
        <p className="muted">電話只會提供給負責配送的司機和服務人員，不會公開。</p>
      </section>

      {state?.errors.length ? (
        <ul className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {state.errors.map((e) => (
            <li key={e}>・{e}</li>
          ))}
        </ul>
      ) : null}

      <button className="btn" disabled={pending}>
        {pending ? "送出中…" : "送出申請"}
      </button>
    </form>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
