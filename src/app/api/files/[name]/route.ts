import { db } from "@/lib/db";
import { readPhoto } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const photo = await db.photo.findUnique({ where: { fileName: name } });
  if (!photo) return new Response("Not found", { status: 404 });
  const buf = await readPhoto(name);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": photo.mimeType, "cache-control": "private, max-age=86400" },
  });
}
