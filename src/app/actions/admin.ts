"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { moveNeed, pauseOverdueRecurring } from "@/lib/workflow";
import { normalizeCounty } from "@/lib/assign";
import { notify } from "@/lib/notify";
import { partnerMemberIds } from "@/lib/partners";

function s(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

function list(v: string): string[] {
  return [...new Set(v.split(/[,，、\s]+/).map(normalizeCounty).filter(Boolean))];
}

export async function reviewNeed(fd: FormData) {
  const admin = await requireAdmin();
  const needId = s(fd, "needId");
  const decision = s(fd, "decision");
  const need = await db.need.findUniqueOrThrow({ where: { id: needId } });
  if (need.status === "submitted") await moveNeed(needId, "reviewing", admin);
  if (decision === "approve") {
    if (fd.get("verifyOrg") === "on") await db.organization.update({ where: { id: need.orgId }, data: { verified: true } });
    await moveNeed(
      needId,
      need.type === "wish" ? "published" : "approved",
      admin,
      need.type === "wish" ? "已公開在許願池，有捐贈者認領時會通知您。" : "已核准，執行夥伴會再跟您約定到貨時間。",
    );
  } else if (decision === "reject") {
    const reason = s(fd, "reason");
    if (!reason) throw new Error("請說明婉拒原因");
    await moveNeed(needId, "rejected", admin, `很抱歉，這次無法受理。原因：${reason}`, { rejectReason: reason });
  }
  revalidatePath("/admin");
}

export async function assignDonationPartner(fd: FormData) {
  const admin = await requireAdmin();
  const donationId = s(fd, "donationId");
  const partnerId = s(fd, "partnerId");
  const partner = await db.partner.findUniqueOrThrow({ where: { id: partnerId } });
  const d = await db.donation.update({ where: { id: donationId }, data: { partnerId: partner.id } });
  await db.statusEvent.create({
    data: { entityType: "donation", entityId: d.id, fromStatus: d.status, toStatus: d.status, note: `改派給 ${partner.name}`, actorId: admin.id },
  });
  for (const uid of await partnerMemberIds(partner.id)) await notify(uid, `donation:${d.code}`, `平台指派一筆捐贈（${d.code}）給您的單位審核。`);
  revalidatePath("/admin");
  revalidatePath("/partner");
}

export async function createPartner(fd: FormData) {
  await requireAdmin();
  const name = s(fd, "name");
  const slug = s(fd, "slug").toLowerCase();
  if (!name || !/^[a-z0-9-]{2,30}$/.test(slug)) throw new Error("請填寫名稱，代號只能用小寫英文、數字、連字號");
  const pickupMode = ["own_fleet", "outsourced", "none"].includes(s(fd, "pickupMode")) ? s(fd, "pickupMode") : "none";
  const categoryIds = fd.getAll("categoryIds").map(String);
  await db.partner.create({
    data: {
      name,
      slug,
      contactName: s(fd, "contactName"),
      contactPhone: s(fd, "contactPhone"),
      contactEmail: s(fd, "contactEmail") || null,
      pickupMode,
      pickupNote: s(fd, "pickupNote") || null,
      pickupFeeNote: s(fd, "pickupFeeNote") || null,
      serviceAreas: JSON.stringify(list(s(fd, "serviceAreas"))),
      deliveryAreas: JSON.stringify(list(s(fd, "deliveryAreas"))),
      priority: Number(s(fd, "priority")) || 100,
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      depots: s(fd, "depotAddress")
        ? { create: [{ name: s(fd, "depotName") || `${name}集貨點`, address: s(fd, "depotAddress"), county: normalizeCounty(s(fd, "depotCounty")), hours: s(fd, "depotHours") || null }] }
        : undefined,
    },
  });
  revalidatePath("/admin");
}

export async function togglePartner(fd: FormData) {
  await requireAdmin();
  const p = await db.partner.findUniqueOrThrow({ where: { id: s(fd, "partnerId") } });
  await db.partner.update({ where: { id: p.id }, data: { active: !p.active } });
  revalidatePath("/admin");
}

export async function addDepot(fd: FormData) {
  await requireAdmin();
  const partnerId = s(fd, "partnerId");
  const address = s(fd, "address");
  if (!address) throw new Error("請填寫地址");
  await db.depot.create({
    data: { partnerId, name: s(fd, "name") || "集貨點", address, county: normalizeCounty(s(fd, "county")), hours: s(fd, "hours") || null },
  });
  revalidatePath("/admin");
}

export async function addPartnerMember(fd: FormData) {
  await requireAdmin();
  const partnerId = s(fd, "partnerId");
  const userId = s(fd, "userId");
  const role = ["manager", "reviewer", "driver"].includes(s(fd, "role")) ? s(fd, "role") : "reviewer";
  await db.partnerMember.upsert({
    where: { partnerId_userId: { partnerId, userId } },
    update: { role },
    create: { partnerId, userId, role },
  });
  revalidatePath("/admin");
}

export async function runRecurringCheck() {
  const admin = await requireAdmin();
  await pauseOverdueRecurring(admin);
  revalidatePath("/admin");
}
