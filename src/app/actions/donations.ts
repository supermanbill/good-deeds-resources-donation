"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isCategorySlug, validateItem, type CategorySlug } from "@/lib/categories";
import { assignPickupPartner, countyFromAddress, depotOptions } from "@/lib/assign";
import { adminIds, loadPartnersForAssign, partnerMemberIds } from "@/lib/partners";
import { donationCode } from "@/lib/codes";
import { notify, recordStatus } from "@/lib/notify";

const itemSchema = z.object({
  categorySlug: z.string(),
  name: z.string().max(100),
  quantity: z.coerce.number().int(),
  unit: z.string().max(20),
  condition: z.string().max(500).optional().default(""),
  usageYears: z.string().max(50).optional().default(""),
  expiryDate: z.string().optional().default(""),
  confirmations: z.record(z.string(), z.boolean()).default({}),
  photoIds: z.array(z.string()).max(10),
  needItemId: z.string().optional().nullable(),
});

const donationSchema = z.object({
  donorType: z.enum(["individual", "company"]),
  contactName: z.string().min(1, "請填寫聯絡人姓名").max(50),
  contactPhone: z.string().min(8, "請填寫聯絡電話").max(30),
  contactEmail: z.string().email("Email 格式不正確").or(z.literal("")).optional(),
  logistics: z.enum(["self_dropoff", "pickup"]),
  depotId: z.string().optional().default(""),
  pickupAddress: z.string().max(200).optional().default(""),
  hasElevator: z.enum(["yes", "no", "unknown"]).default("unknown"),
  groundSteps: z.enum(["yes", "no", "unknown"]).default("unknown"),
  floor: z.string().max(10).optional().default(""),
  campaignSlug: z.string().optional().default(""),
  showOnWall: z.boolean().default(false),
  wantsReceipt: z.boolean().default(false),
  agreedTerms: z.literal(true, { error: "請閱讀並同意捐贈條款" }),
  items: z.array(itemSchema).min(1, "請至少登記一項物資").max(30),
});

export type DonationPayload = z.input<typeof donationSchema>;

export type SubmitResult =
  | { ok: true; code: string; partnerName: string | null }
  | { ok: false; needLogin?: boolean; errors: string[] };

export async function submitDonation(payload: DonationPayload): Promise<SubmitResult> {
  const user = await currentUser();
  if (!user) return { ok: false, needLogin: true, errors: [] };

  const parsed = donationSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const d = parsed.data;

  // 品類規則
  const errors: string[] = [];
  for (const it of d.items) {
    if (!isCategorySlug(it.categorySlug)) {
      errors.push(`未知的品類：${it.categorySlug}`);
      continue;
    }
    errors.push(
      ...validateItem(it.categorySlug, {
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        condition: it.condition,
        usageYears: it.usageYears,
        expiryDate: it.expiryDate,
        confirmations: it.confirmations,
        photoCount: it.photoIds.length,
      }),
    );
  }
  if (errors.length) return { ok: false, errors };

  const slugs = [...new Set(d.items.map((i) => i.categorySlug as CategorySlug))];
  const partners = await loadPartnersForAssign();

  // 決定執行夥伴與集貨點
  let partnerId: string | null = null;
  let depotId: string | null = null;
  let county: string | null = null;
  if (d.logistics === "self_dropoff") {
    const opt = depotOptions(partners, slugs).find((o) => o.depotId === d.depotId);
    if (!opt) return { ok: false, errors: ["請選擇可以收這些品類的集貨點"] };
    partnerId = opt.partnerId;
    depotId = opt.depotId;
  } else {
    if (!d.pickupAddress.trim()) return { ok: false, errors: ["請填寫收貨地址"] };
    county = countyFromAddress(d.pickupAddress);
    // 找不到夥伴也收件，交給平台管理員手動分派
    partnerId = county ? (assignPickupPartner(partners, slugs, county)?.id ?? null) : null;
  }

  // 認領的許願品項必須還在公開募集中
  const needItemIds = d.items.map((i) => i.needItemId).filter((x): x is string => !!x);
  if (needItemIds.length) {
    const ok = await db.needItem.count({
      where: { id: { in: needItemIds }, need: { status: { in: ["published", "partially_matched", "approved"] } } },
    });
    if (ok !== new Set(needItemIds).size) return { ok: false, errors: ["認領的許願已經結束或不存在"] };
  }

  const campaign = d.campaignSlug ? await db.campaign.findUnique({ where: { slug: d.campaignSlug } }) : null;
  const categories = await db.category.findMany({ where: { slug: { in: slugs } } });
  const catId = (s: string) => categories.find((c) => c.slug === s)!.id;

  const code = donationCode();
  const donation = await db.$transaction(async (tx) => {
    const created = await tx.donation.create({
      data: {
        code,
        donorId: user.id,
        donorType: d.donorType,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        contactEmail: d.contactEmail || null,
        logistics: d.logistics,
        depotId,
        partnerId,
        pickupAddress: d.logistics === "pickup" ? d.pickupAddress : null,
        pickupCounty: county,
        hasElevator: d.hasElevator,
        groundSteps: d.groundSteps,
        floor: d.floor || null,
        campaignId: campaign?.status === "open" ? campaign.id : null,
        showOnWall: d.showOnWall,
        wantsReceipt: d.wantsReceipt,
        agreedTerms: true,
        status: "submitted",
      },
    });
    for (const it of d.items) {
      const item = await tx.donationItem.create({
        data: {
          donationId: created.id,
          categoryId: catId(it.categorySlug),
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          condition: it.condition || null,
          usageYears: it.usageYears || null,
          expiryDate: it.expiryDate ? new Date(`${it.expiryDate}T00:00:00+08:00`) : null,
          confirmations: JSON.stringify(it.confirmations),
          needItemId: it.needItemId || null,
        },
      });
      // 只綁定還沒被使用的照片
      const bound = await tx.photo.updateMany({
        where: { id: { in: it.photoIds }, donationItemId: null, proofId: null, kind: "item" },
        data: { donationItemId: item.id },
      });
      if (bound.count < it.photoIds.length) throw new Error("照片已失效，請重新上傳");
    }
    return created;
  });

  await recordStatus({
    entityType: "donation",
    entityId: donation.id,
    code,
    from: null,
    to: "submitted",
    note: partnerId ? "執行夥伴會盡快審核，審核結果會在這裡通知您。" : "我們正在安排適合的執行夥伴，會再通知您。",
    actorId: user.id,
    notifyUserId: user.id,
  });

  const staff = partnerId ? await partnerMemberIds(partnerId) : await adminIds();
  for (const uid of staff) {
    await notify(uid, `donation:${code}`, `有一筆新的捐贈登記（${code}）待審核：${d.items.map((i) => i.name).join("、")}`);
  }

  const partnerName = partnerId ? (partners.find((p) => p.id === partnerId)?.name ?? null) : null;
  return { ok: true, code, partnerName };
}
