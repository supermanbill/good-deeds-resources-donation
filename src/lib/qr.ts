import QRCode from "qrcode";

export function receiveUrl(code: string) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/r/${code}`;
}

/** 回傳可以直接放進 <img src> 的 SVG data URL */
export async function qrDataUrl(code: string): Promise<string> {
  const svg = await QRCode.toString(receiveUrl(code), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
