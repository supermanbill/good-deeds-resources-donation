import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * 照片儲存。開發用本機 uploads/ 目錄，正式環境換成好事道的物件儲存。
 */

const DIR = path.join(process.cwd(), "uploads");

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function isAllowedType(mime: string) {
  return mime in EXT;
}

export async function savePhoto(file: File): Promise<{ fileName: string; mimeType: string }> {
  if (!isAllowedType(file.type)) throw new Error("只接受 JPG、PNG、WEBP、HEIC 照片或 MP4、MOV 影片");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("每個檔案不能超過 8MB");
  await mkdir(DIR, { recursive: true });
  const fileName = `${randomUUID()}.${EXT[file.type]}`;
  await writeFile(path.join(DIR, fileName), Buffer.from(await file.arrayBuffer()));
  return { fileName, mimeType: file.type };
}

export async function readPhoto(fileName: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{3,4}$/.test(fileName)) return null;
  try {
    return await readFile(path.join(DIR, fileName));
  } catch {
    return null;
  }
}

export function photoUrl(fileName: string) {
  return `/api/files/${fileName}`;
}
