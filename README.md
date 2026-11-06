# 好事道物資捐贈媒合平台

主辦與受款單位：社團法人好事公益協會｜技術平台：好事道

一邊是想捐物資的個人與企業，一邊是偏鄉教會、NGO、村辦與家庭的需求。平台串起捐贈登記、執行夥伴審核、入倉、媒合、配送、掃碼收貨、發放回報，每一步都透過好事道聊天通知相關的人。

需求與架構文件放在 claude.ai 專案「coding - 寫一個物資捐贈媒合平台」：`需求/系統架構_v1.md`、`需求/需求決策紀錄.md`。

## 目前進度：第一期（MVP）

| 功能 | 狀態 |
|---|---|
| 捐贈登記：五大品類各有規則、照片、兩種運送方式、先填表後登入（暫存） | ✅ |
| 許願池：一次性與定期需求、捐贈者「我來捐」認領 | ✅ |
| 活動頁與活動申請（例如聖誕禮物送偏鄉）、捐款金額表 | ✅ |
| 執行夥伴不寫死：集貨點、到府範圍、收件品類、自動分派、管理員改派 | ✅ |
| 夥伴後台：審核、婉拒（附原因）、補件、入倉產生 QR、分配（手動／自動拆單）、出貨 | ✅ |
| QR 標籤列印、收貨方掃碼確認、發放回報、夥伴代傳 | ✅ |
| 定期需求每 3 個月重新確認、逾期暫停、結案後自動開下一期 | ✅ |
| 電話備援：好事道訊息 24 小時未讀，夥伴後台提醒改打電話；電話只給被指派的人看 | ✅ |
| 我的好事：好事履歷、進度、模擬好事道訊息收件匣 | ✅ |
| 好事道會員與聊天：轉接介面（目前 mock） | ⏳ 等好事道 API |
| 捐款：分用途導向金流頁（目前用外部連結 `DONATION_URL`） | ⏳ 等協會金流連結 |
| 物資展示牆、配送單排車與司機頁、影響力看板、報表 | 第二期 |

## 本機執行

需要 Node.js 20 以上。

```bash
npm install
cp .env.example .env
npm run db:reset     # 建立 SQLite 開發資料庫並寫入示範資料
npm run dev          # http://localhost:3000
```

開發模式下，登入頁可以直接選示範帳號：

| 帳號 | 用途 |
|---|---|
| 好事公益協會（管理員） | 平台管理：審核需求、管理夥伴、改派 |
| 荃安審核員（示範） | 夥伴後台：審核捐贈、入倉、分配、出貨 |
| 王小明（示範捐贈者） | 捐贈、認領許願、看好事履歷 |
| 示範牧師 | 提需求、掃碼收貨、回報發放 |

示範教會、人名與電話都是虛構資料。

## 測試

```bash
npm test     # 單元測試 + 完整流程整合測試（使用獨立的 prisma/test.db）
npm run lint # TypeScript 型別檢查
```

整合測試會跑完整個流程：許願 → 認領 → 審核 → 入倉 → 配給 → 出貨 → 掃碼收貨 → 發放回報 → 結案 → 定期需求開下一期，另外也測拆單、婉拒和狀態保護。

## 程式結構

```
prisma/schema.prisma        資料模型（開發 SQLite，正式改 PostgreSQL）
prisma/seed.ts              品類、荃安、示範資料
src/lib/
  status.ts                 捐贈單、需求單狀態機（所有狀態變更都要經過檢查）
  categories.ts             五大品類收件規則
  assign.ts                 執行夥伴分派（自行送達選集貨點、到府依縣市與品類）
  match.ts                  數量拆分（依截止日分配）
  privacy.ts                電話可見性、遮罩、24 小時電話備援判斷
  workflow.ts               入倉、分配、出貨、收貨、回報等跨單據流程
  notify.ts                 好事道通知＋狀態紀錄
  gooddeeds/index.ts        好事道會員與聊天轉接層（mock / live）
  storage.ts                照片儲存（開發用本機 uploads/）
src/app/                    頁面與 server actions
tests/                      單元測試與整合測試
```

## 接上好事道（給 Mason）

1. 在 `src/lib/gooddeeds/index.ts` 實作 `LiveGoodDeeds`：
   - `loginUrl()`：好事道 OAuth 或 SSO 登入網址
   - `sendChat()`：送訊息到好事道聊天；`threadKey` 用來把同一筆捐贈或需求的訊息放在同一個對話串
2. 登入回呼：建立或更新 `User`（以 `goodDeedsId` 對應），再呼叫 `setSessionUser()`
3. 已讀回報：好事道回報已讀時更新 `ChatMessage.readAt`，電話備援提醒才會準確
4. `.env` 設定 `GOODDEEDS_MODE=live`、`GOODDEEDS_API_BASE`、`GOODDEEDS_API_KEY`
5. 照片儲存：把 `src/lib/storage.ts` 換成好事道的物件儲存

## 上線前待辦

- 資料庫改用 PostgreSQL（`schema.prisma` 的 provider 改成 `postgresql`）
- 每天自動執行 `pauseOverdueRecurring()`，並清除沒有綁定的上傳照片
- 確認協會的金流捐款頁網址（`DONATION_URL`）
- 捐贈同意條款、隱私權聲明請協會確認文字
