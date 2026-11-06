import { db } from "@/lib/db";
import { mockLogin, mockRegister } from "../actions/auth";

/** mock 模式的好事道登入頁。正式模式會導到好事道的登入頁，不會用到這頁。 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/me" } = await searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, take: 20 });

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        開發模式：這裡模擬好事道登入。正式上線後，會改為導向好事道的登入與註冊頁。
      </div>

      <section className="card space-y-3">
        <h1 className="font-medium">選擇示範帳號登入</h1>
        {users.map((u) => (
          <form key={u.id} action={mockLogin}>
            <input type="hidden" name="userId" value={u.id} />
            <input type="hidden" name="next" value={next} />
            <button className="btn-outline w-full justify-start">{u.name}</button>
          </form>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">註冊新的好事道會員</h2>
        <form action={mockRegister} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="label">姓名</label>
            <input name="name" required className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" />
          </div>
          <div>
            <label className="label">手機</label>
            <input name="phone" className="input" />
          </div>
          <button className="btn w-full">註冊並登入</button>
        </form>
      </section>
    </div>
  );
}
