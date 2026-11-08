/**
 * 初始資料：品類、第一個執行夥伴（荃安）、示範帳號、示範活動與許願。
 * 示範帳號與教會為虛構資料，電話為佔位號碼。
 */
import { PrismaClient } from "@prisma/client";
import { CATEGORY_RULES } from "../src/lib/categories";

const db = new PrismaClient();

async function main() {
  const cats = Object.values(CATEGORY_RULES);
  for (const [i, c] of cats.entries()) {
    await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sort: i },
      create: { slug: c.slug, name: c.name, sort: i },
    });
  }
  const allCats = await db.category.findMany();
  const catId = (slug: string) => allCats.find((c) => c.slug === slug)!.id;

  const quanan = await db.partner.upsert({
    where: { slug: "quanan" },
    update: {},
    create: {
      slug: "quanan",
      name: "桃園市荃安長照關懷協會",
      contactName: "劉建宏",
      contactPhone: "0900-000-000",
      pickupMode: "outsourced",
      pickupNote: "荃安依物品大小安排合適的貨運行到府載運",
      pickupFeeNote: "運費由捐贈者負擔，可能電話確認或現場議定",
      serviceAreas: JSON.stringify(["台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "台中市", "宜蘭縣", "花蓮縣"]),
      deliveryAreas: JSON.stringify(["花蓮縣", "台東縣", "宜蘭縣"]),
      priority: 10,
      depots: {
        create: [{ name: "桃園八德倉庫", address: "桃園市八德區和強路135之7號", county: "桃園市", hours: "荃安上班時間（審核通過後請先約時間）" }],
      },
      categories: { create: cats.map((c) => ({ categoryId: catId(c.slug) })) },
    },
  });

  const admin = await db.user.upsert({
    where: { goodDeedsId: "demo-admin" },
    update: {},
    create: { goodDeedsId: "demo-admin", name: "好事公益協會（管理員）", role: "admin", phone: "0900-000-001" },
  });

  const reviewer = await db.user.upsert({
    where: { goodDeedsId: "demo-partner" },
    update: {},
    create: { goodDeedsId: "demo-partner", name: "荃安審核員（示範）", phone: "0900-000-002" },
  });
  await db.partnerMember.upsert({
    where: { partnerId_userId: { partnerId: quanan.id, userId: reviewer.id } },
    update: {},
    create: { partnerId: quanan.id, userId: reviewer.id, role: "manager" },
  });

  await db.user.upsert({
    where: { goodDeedsId: "demo-donor" },
    update: {},
    create: { goodDeedsId: "demo-donor", name: "王小明（示範捐贈者）", email: "donor@example.com", phone: "0900-000-003" },
  });

  const church = await db.organization.create({
    data: { name: "示範部落教會", type: "church", verified: true, address: "花蓮縣卓溪鄉示範村1鄰1號", phone: "03-0000000" },
  });
  const pastor = await db.user.upsert({
    where: { goodDeedsId: "demo-church" },
    update: { orgId: church.id },
    create: { goodDeedsId: "demo-church", name: "示範牧師", phone: "0900-000-004", orgId: church.id },
  });

  const now = new Date();
  const year = now.getFullYear();
  await db.campaign.upsert({
    where: { slug: `xmas-${year}` },
    update: {},
    create: {
      slug: `xmas-${year}`,
      title: `${year} 聖誕禮物送偏鄉`,
      summary: "邀請企業與員工家庭募集全新小物，送到花東、宜蘭、南投、屏東的偏鄉教會。",
      description:
        "請募集全新、可使用、未拆封的小物（保溫瓶、保鮮盒、文具、兒童玩具等），裝箱、拍照，並在箱上標註公司名稱。\n不收：食品、月曆、桌曆、筆記本。\n每箱上限：長＋寬＋高 180 公分、30 公斤。建議一箱裝多種物品。",
      startsAt: new Date(`${year}-11-11T00:00:00+08:00`),
      endsAt: new Date(`${year}-12-12T23:59:59+08:00`),
      status: "open",
      donationTiers: JSON.stringify([
        { amount: 6000, label: "15 箱以內" },
        { amount: 9000, label: "16–25 箱" },
        { amount: 12000, label: "26–35 箱" },
        { amount: 15000, label: "36–45 箱" },
        { amount: 18000, label: "46–55 箱" },
        { amount: 21000, label: "56–65 箱" },
        { amount: 24000, label: "66–75 箱" },
        { amount: 27000, label: "76–85 箱" },
        { amount: 30000, label: "86–100 箱" },
      ]),
    },
  });

  const base = {
    type: "wish",
    orgId: church.id,
    requesterId: pastor.id,
    status: "published",
    unitAddress: church.address!,
    deliveryAddress: church.address!,
    deliveryCounty: "花蓮縣",
    addressNote: "從台 30 線轉進示範村，教會在活動中心旁",
    mobile: "0900-000-004",
    truckAccess: "no",
    receiveHours: "週一至週五上午",
  };
  await db.need.create({
    data: {
      ...base,
      code: "N-DEMO-0001",
      title: "長者與嬰幼兒尿布（每月）",
      description: "部落有 12 位臥床長者、8 位嬰幼兒，每月需要尿布。",
      frequency: "monthly",
      peopleCount: 20,
      nextReviewAt: new Date(now.getTime() + 90 * 86_400_000),
      items: { create: [{ categoryId: catId("expiring_goods"), name: "成人紙尿褲（M、L）", quantity: 20, unit: "包" }] },
    },
  });
  await db.need.create({
    data: {
      ...base,
      code: "N-DEMO-0002",
      title: "兒童課輔班需要一台鋼琴",
      description: "教會課輔班有 25 位孩子想學琴，希望有一台可以正常使用的直立式鋼琴。",
      deadline: new Date(now.getTime() + 60 * 86_400_000),
      peopleCount: 25,
      items: { create: [{ categoryId: catId("furniture"), name: "直立式鋼琴", quantity: 1, unit: "台" }] },
    },
  });

  console.log("seed 完成：", { partner: quanan.name, admin: admin.name });
}

main().finally(() => db.$disconnect());
