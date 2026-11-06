/**
 * 好事道整合轉接層。
 *
 * 平台的會員登入與聊天訊息都由好事道提供。這裡定義介面，目前用 mock 實作：
 * - 登入：/login 選擇示範帳號（cookie）
 * - 聊天：訊息寫進 ChatMessage 表，顯示在「我的好事」收件匣
 *
 * 好事道提供 API 後，實作 LiveGoodDeeds 並把 GOODDEEDS_MODE 設為 live，
 * 其餘程式不需要更動。
 */

export interface GoodDeedsProfile {
  goodDeedsId: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface GoodDeedsChatMessage {
  /** 平台內部 User.id */
  userId: string;
  goodDeedsId: string;
  /** 同一筆捐贈或需求的訊息放在同一個對話串，例如 donation:D-20261106-7KQ4 */
  threadKey: string;
  body: string;
}

export interface GoodDeedsAdapter {
  mode: "mock" | "live";
  /** 好事道登入頁網址；登入成功後導回 returnTo */
  loginUrl(returnTo: string): string;
  /** 送一則訊息到好事道聊天；回傳是否送達 */
  sendChat(msg: GoodDeedsChatMessage): Promise<boolean>;
}

class MockGoodDeeds implements GoodDeedsAdapter {
  mode = "mock" as const;
  loginUrl(returnTo: string) {
    return `/login?next=${encodeURIComponent(returnTo)}`;
  }
  async sendChat(): Promise<boolean> {
    // mock：訊息本身由 notify.ts 寫進 ChatMessage，這裡不需要外送
    return true;
  }
}

class LiveGoodDeeds implements GoodDeedsAdapter {
  mode = "live" as const;
  constructor(private base: string, private key: string) {}
  loginUrl(returnTo: string) {
    return `${this.base}/oauth/authorize?redirect_uri=${encodeURIComponent(returnTo)}`;
  }
  async sendChat(msg: GoodDeedsChatMessage): Promise<boolean> {
    // 待好事道提供 API 規格後確認端點與欄位
    const res = await fetch(`${this.base}/api/chat/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ to: msg.goodDeedsId, thread: msg.threadKey, text: msg.body }),
    });
    return res.ok;
  }
}

let adapter: GoodDeedsAdapter | null = null;

export function goodDeeds(): GoodDeedsAdapter {
  if (adapter) return adapter;
  const mode = process.env.GOODDEEDS_MODE ?? "mock";
  adapter =
    mode === "live"
      ? new LiveGoodDeeds(process.env.GOODDEEDS_API_BASE ?? "", process.env.GOODDEEDS_API_KEY ?? "")
      : new MockGoodDeeds();
  return adapter;
}
