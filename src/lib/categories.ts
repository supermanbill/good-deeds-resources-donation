/**
 * 品類收件規則。資料庫的 Category.slug 對應這裡的 key。
 * 審核員仍會人工確認，這裡只擋掉明顯不符合的登記。
 */

export type CategorySlug = "expiring_goods" | "furniture" | "appliance" | "apparel" | "new_gift";

export interface ItemInput {
  name: string;
  quantity: number;
  unit: string;
  condition?: string;
  usageYears?: string;
  expiryDate?: string; // YYYY-MM-DD
  confirmations: Record<string, boolean>;
  photoCount: number;
}

export interface CategoryRule {
  slug: CategorySlug;
  name: string;
  summary: string;
  minPhotos: number;
  /** 捐贈者要勾選的確認事項 */
  confirmations: { key: string; label: string }[];
  photoHint: string;
  requiresExpiry?: boolean;
  requiresUsageYears?: boolean;
  /** 品名含有這些字就不收 */
  bannedKeywords?: string[];
}

export const MIN_EXPIRY_DAYS = 90;

export const CATEGORY_RULES: Record<CategorySlug, CategoryRule> = {
  expiring_goods: {
    slug: "expiring_goods",
    name: "即期品（食品、生活用品）",
    summary: "常溫可配送，有效期限還有 3 個月以上",
    minPhotos: 2,
    photoHint: "請拍外包裝與有效期限標示",
    requiresExpiry: true,
    confirmations: [{ key: "ambient", label: "常溫保存即可，不需冷藏冷凍" }],
  },
  furniture: {
    slug: "furniture",
    name: "二手傢俱",
    summary: "結構完整、無蟲蛀，請註明使用年限",
    minPhotos: 2,
    photoHint: "請拍正面與細節（接合處、表面）",
    requiresUsageYears: true,
    confirmations: [{ key: "sturdy", label: "結構穩固、沒有蟲蛀或嚴重破損" }],
  },
  appliance: {
    slug: "appliance",
    name: "二手家電",
    summary: "必須能正常運作",
    minPhotos: 2,
    photoHint: "請拍外觀與通電運作中的畫面",
    requiresUsageYears: true,
    confirmations: [{ key: "working", label: "我確認這項家電可以正常運作" }],
  },
  apparel: {
    slug: "apparel",
    name: "生活用品（衣物、鞋、飾品）",
    summary: "乾淨、無破損，建議依尺寸分袋",
    minPhotos: 1,
    photoHint: "請攤開拍攝，看得出狀況",
    confirmations: [{ key: "clean", label: "已清洗乾淨、沒有破損" }],
  },
  new_gift: {
    slug: "new_gift",
    name: "全新禮物（活動用）",
    summary: "全新未拆封；不收食品、月曆、桌曆、筆記本",
    minPhotos: 1,
    photoHint: "請拍裝箱內容",
    bannedKeywords: ["食品", "零食", "月曆", "桌曆", "筆記本"],
    confirmations: [{ key: "sealed", label: "全新、未使用、未拆封" }],
  },
};

export function isCategorySlug(s: string): s is CategorySlug {
  return s in CATEGORY_RULES;
}

/** 回傳錯誤訊息清單；空陣列代表通過 */
export function validateItem(slug: CategorySlug, item: ItemInput, today: Date = new Date()): string[] {
  const rule = CATEGORY_RULES[slug];
  const errors: string[] = [];
  const label = item.name.trim() || "這個品項";

  if (!item.name.trim()) errors.push("請填寫物資名稱");
  if (!Number.isInteger(item.quantity) || item.quantity < 1) errors.push(`${label}：數量至少為 1`);
  if (!item.unit.trim()) errors.push(`${label}：請填寫單位`);

  if (item.photoCount < rule.minPhotos) {
    errors.push(`${label}：至少需要 ${rule.minPhotos} 張照片（${rule.photoHint}）`);
  }

  for (const c of rule.confirmations) {
    if (!item.confirmations[c.key]) errors.push(`${label}：請確認「${c.label}」`);
  }

  if (rule.requiresUsageYears && !item.usageYears?.trim()) {
    errors.push(`${label}：請填寫大約使用年限`);
  }

  if (rule.requiresExpiry) {
    if (!item.expiryDate) {
      errors.push(`${label}：請填寫有效期限`);
    } else {
      const exp = new Date(`${item.expiryDate}T00:00:00+08:00`);
      if (Number.isNaN(exp.getTime())) {
        errors.push(`${label}：有效期限格式不正確`);
      } else {
        const days = (exp.getTime() - today.getTime()) / 86_400_000;
        if (days < MIN_EXPIRY_DAYS) {
          errors.push(`${label}：有效期限需要還有 ${MIN_EXPIRY_DAYS} 天以上`);
        }
      }
    }
  }

  if (rule.bannedKeywords) {
    const hit = rule.bannedKeywords.find((k) => item.name.includes(k));
    if (hit) errors.push(`${label}：這個品類不收「${hit}」`);
  }

  return errors;
}
