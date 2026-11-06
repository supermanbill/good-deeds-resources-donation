import { db } from "@/lib/db";
import { savePhoto } from "@/lib/storage";

/**
 * 上傳捐贈照片。允許尚未登入時先上傳（填表暫存），照片在送出捐贈時才綁定到品項。
 * 沒有綁定的照片可以定期清除。
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "沒有檔案" }, { status: 400 });
  if (files.length > 10) return Response.json({ error: "一次最多 10 個檔案" }, { status: 400 });
  try {
    const saved = [];
    for (const f of files) {
      const s = await savePhoto(f);
      const p = await db.photo.create({ data: { ...s, kind: "item" } });
      saved.push({ id: p.id, url: `/api/files/${p.fileName}` });
    }
    return Response.json({ photos: saved });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
