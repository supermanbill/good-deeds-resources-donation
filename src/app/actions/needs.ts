"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { countyFromAddress } from "@/lib/assign";
import { needCode } from "@/lib/codes";
import { adminIds } from "@/lib/partners";
import { notify, recordStatus } from "@/lib/notify";
import { nextReviewDate } from "@/lib/status";

const ORG_TYPES = ["church", "ngo", "village", "household", "company"];
const MAX_ITEMS = 5;

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

export async function submitNeed(_prev: { errors: string[] } | null, fd: FormData): Promise<{ errors: string[] }> {
  const campaignSlug = s(fd, "campaignSlug");
  const user = await requireUser(campaignSlug ? `/needs/new?campaign=${campaignSlug}` : "/needs/new");
  const errors: string[] = [];

  const campaign = campaignSlug ? await db.campaign.findUnique({ where: { slug: campaignSlug } }) : null;
  if (campaignSlug && campaign?.status !== "open") errors.push("這個活動目前沒有開放申請");
  const type = campaign ? "campaign" : "wish";

  let orgId = user.orgId;
  if (!orgId) {
    const orgName = s(fd, "orgName");
    const orgType = s(fd, "orgType");
    if (!orgName) errors.push("請填寫單位名稱");
    if (!ORG_TYPES.includes(orgType)) errors.push("請選擇單位類型");
    if (!errors.length) {
      const org = await db.organization.create({
        data: { name: orgName, type: orgType, address: s(fd, "unitAddress"), phone: s(fd, "landline") || null },
      });
      await db.user.update({ where: { id: user.id }, data: { orgId: org.id } });
      orgId = org.id;
    }
  }

  const title = s(fd, "title");
  const description = s(fd, "description");
  const unitAddress = s(fd, "unitAddress");
  const deliveryAddress = s(fd, "deliveryAddress") || unitAddress;
  const mobile = s(fd, "mobile");
  const frequency = s(fd, "frequency") || "once";
  if (!title) errors.push("請填寫需求標題");
  if (!description) errors.push("請說明用途與受益對象");
  if (!unitAddress) errors.push("請填寫單位地址");
  if (!/^09\d{2}-?\d{3}-?\d{3}$/.test(mobile)) errors.push("請填寫正確的手機號碼（例如 0912-345-678）");
  if (!["once", "monthly", "quarterly"].includes(frequency)) errors.push("需求頻率不正確");
  const county = countyFromAddress(deliveryAddress);
  if (deliveryAddress && !county) errors.push("收貨地址請從縣市開始填寫");

  const categories = await db.category.findMany();
  const items: { categoryId: string; name: string; quantity: number; unit: string }[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const name = s(fd, `item_${i}_name`);
    if (!name) continue;
    const cat = categories.find((c) => c.slug === s(fd, `item_${i}_category`));
    const quantity = Number(s(fd, `item_${i}_quantity`));
    if (!cat) errors.push(`「${name}」請選擇品類`);
    if (!Number.isInteger(quantity) || quantity < 1) errors.push(`「${name}」數量至少為 1`);
    if (cat) items.push({ categoryId: cat.id, name, quantity, unit: s(fd, `item_${i}_unit`) || "件" });
  }
  if (items.length === 0) errors.push("請至少填一項需要的物資");

  const deadline = s(fd, "deadline");
  const latestArrival = s(fd, "latestArrival");
  const people = Number(s(fd, "peopleCount"));

  if (errors.length || !orgId) return { errors };

  const code = needCode();
  const need = await db.need.create({
    data: {
      code,
      type,
      orgId,
      requesterId: user.id,
      campaignId: campaign?.id ?? null,
      title,
      description,
      frequency: type === "campaign" ? "once" : frequency,
      deadline: deadline ? new Date(`${deadline}T23:59:59+08:00`) : null,
      peopleCount: Number.isInteger(people) && people > 0 ? people : null,
      unitAddress,
      deliveryAddress,
      deliveryCounty: county,
      addressNote: s(fd, "addressNote") || null,
      mobile,
      landline: s(fd, "landline") || null,
      siteContactName: s(fd, "siteContactName") || null,
      siteContactPhone: s(fd, "siteContactPhone") || null,
      truckAccess: ["yes", "no", "unknown"].includes(s(fd, "truckAccess")) ? s(fd, "truckAccess") : "unknown",
      receiveHours: s(fd, "receiveHours") || null,
      latestArrival: latestArrival ? new Date(`${latestArrival}T23:59:59+08:00`) : null,
      transitHub: fd.get("transitHub") === "on",
      nextReviewAt: frequency !== "once" ? nextReviewDate(new Date()) : null,
      items: { create: items },
    },
  });

  await recordStatus({
    entityType: "need",
    entityId: need.id,
    code,
    from: null,
    to: "submitted",
    note: "好事公益協會會先確認單位資料，審核結果會透過好事道通知您。",
    actorId: user.id,
    notifyUserId: user.id,
  });
  for (const a of await adminIds()) await notify(a, `need:${code}`, `有一筆新的${type === "wish" ? "許願" : "活動申請"}（${code}）待審核：${title}`);

  redirect(`/me?submitted=${code}`);
}
