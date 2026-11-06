# 物資媒合平台 × 好事道｜串接規格 v1

> 給：Mason（好事道平台工程）
> 版本：v1（2026-11-06）
> 目的：物資媒合平台（本 repo）不自己管理會員和聊天，全部透過好事道。本文件列出平台需要好事道提供哪些功能，以及平台這邊已經準備好什麼。
>
> 端點路徑、欄位名稱都是建議，可以依好事道現有的設計調整。調整後請更新本文件，平台這邊改轉接層（`src/lib/gooddeeds/index.ts`）就好。

---

## 總覽：需要好事道提供的 5 件事

| # | 項目 | 用途 | 優先順序 |
|---|---|---|---|
| 1 | **會員登入（OAuth 2.0／OIDC）** | 捐贈者、需求方、夥伴人員都用好事道帳號登入 | 必要 |
| 2 | **送聊天訊息** | 每次狀態變更自動通知；夥伴、捐贈者、收貨單位之間聯繫 | 必要 |
| 3 | **Webhook：已讀、使用者回覆** | 訊息超過 24 小時沒讀就提醒改打電話；捐贈者補件直接在聊天回覆 | 必要 |
| 4 | **好事紀錄寫入** | 把捐贈、送達、發放成果記到會員的「好事履歷」與影響力 | 建議 |
| 5 | **檔案上傳** | 捐贈照片、送達與發放照片改存好事道 | 可以晚一點 |

平台的會員資料以 `goodDeedsId`（好事道的使用者 ID）對應，不另存密碼。

---

## 1. 會員登入（OAuth 2.0 Authorization Code ＋ PKCE）

### 流程
1. 使用者在平台按「加入好事道」或「登入」
2. 平台導到好事道：
   ```
   GET {GOODDEEDS_BASE}/oauth/authorize
     ?response_type=code
     &client_id={CLIENT_ID}
     &redirect_uri={APP_URL}/api/auth/callback
     &scope=openid profile phone email chat:write
     &state={隨機值}
     &code_challenge={PKCE}&code_challenge_method=S256
     &screen=signup          ← 選填：直接顯示註冊畫面
   ```
3. 使用者在好事道登入或註冊（新會員註冊完要能**自動導回**，不要停在好事道首頁）
4. 好事道導回 `redirect_uri?code=...&state=...`
5. 平台用 code 換 token：`POST {BASE}/oauth/token`
6. 平台查詢會員資料：`GET {BASE}/api/me`

### `GET /api/me` 需要的欄位
```json
{
  "id": "gd_u_123",            // 必要，平台用來對應會員
  "name": "王小明",             // 必要
  "email": "a@example.com",     // 選填
  "phone": "0912345678",        // 選填；電話備援會用到
  "phoneVerified": true,        // 選填
  "avatarUrl": "https://...",   // 選填
  "organizations": [            // 選填；若好事道有組織／企業帳號
    { "id": "gd_o_9", "name": "示範部落教會", "type": "church", "role": "admin" }
  ]
}
```

### 需要確認
- [ ] 好事道現在有 OAuth／OIDC 嗎？沒有的話，短期可以用「簽章連結」替代（好事道產生帶 HMAC 簽章的一次性登入網址）
- [ ] 註冊流程能不能帶 `redirect_uri` 回到平台？這點很關鍵：使用者是填完捐贈表單才被要求註冊，表單內容暫存在瀏覽器，註冊完一定要回到原頁
- [ ] 企業會員能不能有多位同事？有的話 `organizations` 一起回傳

---

## 2. 送聊天訊息

### 對話串（thread）
平台以 **外部 key** 區分對話串，同一筆捐贈或需求的訊息要在同一個串裡：

| externalKey | 參與者 |
|---|---|
| `donation:D-20261106-7KQ4` | 捐贈者＋負責的執行夥伴人員 |
| `need:N-20261106-AB3C` | 需求方＋協會管理員；配送後加入執行夥伴 |
| `match:{媒合ID}`（第二期） | 捐贈者＋需求方＋執行夥伴 |

### 建議端點
```
PUT  /api/chat/threads/by-key/{externalKey}      建立或取得對話串（冪等）
     body: { "title": "捐贈 D-20261106-7KQ4", "participants": ["gd_u_1","gd_u_2"] }
     → { "threadId": "t_123" }

POST /api/chat/threads/{threadId}/participants   加入參與者（例如改派夥伴）
     body: { "userIds": ["gd_u_5"] }

POST /api/chat/threads/{threadId}/messages       送訊息
     header: Idempotency-Key: {平台產生的訊息ID}
     body: {
       "from": "system" | "gd_u_2",              // 系統通知，或代表夥伴人員發送
       "text": "您的捐贈（D-...）狀態更新：已通過",
       "actions": [                               // 選填：訊息上的按鈕
         { "label": "查看進度", "url": "https://.../me" }
       ]
     }
     → { "messageId": "m_456", "deliveredTo": ["gd_u_1"] }
```

### 平台會送出的訊息類型
審核通過、婉拒（附原因）、要求補件、入倉、已媒合、出貨、已送達、發放回報結果、定期需求確認提醒，加上夥伴人員手打的訊息。訊息內容由平台產生，好事道只要負責送達與顯示。

### 需要確認
- [ ] 好事道聊天有沒有**網頁版**？長輩和部分企業窗口可能不裝 App
- [ ] 有沒有推播？推播是「不用打電話」的關鍵
- [ ] 訊息能不能帶按鈕或連結？

---

## 3. Webhook：已讀與使用者回覆

平台會開一個接收端點：`POST {APP_URL}/api/gooddeeds/webhook`

### 事件
```json
{ "type": "message.read",
  "threadKey": "donation:D-20261106-7KQ4",
  "messageId": "m_456", "userId": "gd_u_1", "readAt": "2026-11-06T08:00:00Z" }

{ "type": "message.created",
  "threadKey": "donation:D-20261106-7KQ4",
  "messageId": "m_789", "userId": "gd_u_1",
  "text": "補拍好了", "attachments": [{ "url": "...", "mimeType": "image/jpeg" }],
  "createdAt": "2026-11-06T08:05:00Z" }
```

### 安全
- Header `X-GoodDeeds-Signature: sha256=HMAC(webhookSecret, rawBody)`
- Header `X-GoodDeeds-Timestamp`，超過 5 分鐘的請求平台會拒收
- 失敗時好事道請重送（建議指數退避，最多 24 小時）；平台用 `messageId` 去重複

### 用途
- `message.read` → 更新 `ChatMessage.readAt`。**電話備援要靠它才準**：沒有已讀回報，系統會以為每則訊息都沒讀，24 小時後全部提醒打電話
- `message.created` → 捐贈者在聊天回覆補件時，夥伴後台看得到，而且可以直接「繼續審核」

---

## 4. 好事紀錄寫入（好事履歷、影響力）

好事道負責記錄會員做過的好事。平台在以下時間點寫一筆：

| 時間點 | 對象 | 內容 |
|---|---|---|
| 捐贈送達 | 捐贈者 | 捐了什麼、數量、送到哪個單位（地區只到鄉鎮） |
| 發放回報 | 捐贈者、需求方、執行夥伴 | 受益戶數、活動名稱、照片 |
| 入倉、配送 | 執行夥伴 | 處理件數、配送趟次 |

```
POST /api/impact/records
header: Idempotency-Key: {平台紀錄ID}
body: {
  "userId": "gd_u_1",                // 或 organizationId
  "source": "resources-donation",
  "type": "donation.delivered",
  "occurredAt": "2026-11-06T08:00:00Z",
  "title": "捐贈成人紙尿褲 20 包給示範部落教會",
  "metrics": { "items": 20, "households": 12 },
  "evidence": [{ "url": "...", "kind": "photo" }],
  "link": "https://.../wishes/xxx"
}
```

### 需要確認
- [ ] 好事道現在的影響力或 SROI 資料，要用什麼格式接？上面的 `metrics` 欄位請 Mason 定義
- [ ] 企業會員的影響力看板，能不能用這些紀錄自動產生？

---

## 5. 檔案上傳（可以晚一點）

目前照片存在平台主機的 `uploads/`。之後建議改用好事道的物件儲存：
```
POST /api/files/presign   body: { "mimeType": "image/jpeg", "size": 123456 }
→ { "uploadUrl": "...", "fileId": "f_1", "publicUrl": "..." }
```
平台只需要改 `src/lib/storage.ts`。

---

## 平台這邊已經準備好的部分

| 項目 | 位置 | 狀態 |
|---|---|---|
| 轉接層介面（mock／live 切換） | `src/lib/gooddeeds/index.ts` | ✅ 已完成，`LiveGoodDeeds` 待依本規格實作 |
| 會員對應 `User.goodDeedsId` | `prisma/schema.prisma` | ✅ |
| 對話串 key 規則 `donation:…`、`need:…` | `src/lib/notify.ts` | ✅ |
| 訊息本地紀錄與已讀欄位 `ChatMessage.readAt` | `prisma/schema.prisma` | ✅ |
| 24 小時未讀電話備援 | `src/lib/notify.ts`、夥伴後台 | ✅（等 webhook 已讀資料） |
| OAuth callback `/api/auth/callback` | — | ⏳ 收到規格後實作 |
| Webhook 接收 `/api/gooddeeds/webhook` | — | ⏳ 收到規格後實作 |
| 好事紀錄寫入 | — | ⏳ 收到規格後實作 |

## 需要好事道提供的設定值

```
GOODDEEDS_MODE=live
GOODDEEDS_API_BASE=https://...
GOODDEEDS_CLIENT_ID=...
GOODDEEDS_CLIENT_SECRET=...
GOODDEEDS_WEBHOOK_SECRET=...
```
另外請提供測試環境（staging）和幾個測試帳號。

## 建議時程

1. **第 1 週**：Mason 回覆上面的「需要確認」，決定登入方式
2. **第 2 週**：登入＋送訊息上線到 staging，平台這邊完成 live 轉接層
3. **第 3 週**：Webhook（已讀、回覆）
4. **之後**：好事紀錄寫入、檔案儲存
