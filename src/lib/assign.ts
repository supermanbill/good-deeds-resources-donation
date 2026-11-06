/**
 * 執行夥伴分派。夥伴不寫死，依品類、地區、到府能力決定。
 */

export interface PartnerForAssign {
  id: string;
  name: string;
  active: boolean;
  pickupMode: string; // own_fleet | outsourced | none
  serviceAreas: string[];
  priority: number;
  categorySlugs: string[];
  openCases: number;
  depots: { id: string; name: string; address: string; county: string; active: boolean }[];
}

export interface DepotOption {
  depotId: string;
  depotName: string;
  address: string;
  partnerId: string;
  partnerName: string;
}

function acceptsAll(p: PartnerForAssign, slugs: string[]): boolean {
  return slugs.every((s) => p.categorySlugs.includes(s));
}

/** 自行送達：列出可以收這些品類的所有集貨點，讓捐贈者自己挑 */
export function depotOptions(partners: PartnerForAssign[], slugs: string[]): DepotOption[] {
  return partners
    .filter((p) => p.active && acceptsAll(p, slugs))
    .sort((a, b) => a.priority - b.priority)
    .flatMap((p) =>
      p.depots
        .filter((d) => d.active)
        .map((d) => ({
          depotId: d.id,
          depotName: d.name,
          address: d.address,
          partnerId: p.id,
          partnerName: p.name,
        })),
    );
}

/** 台灣縣市名稱正規化：臺→台 */
export function normalizeCounty(s: string): string {
  return s.trim().replace(/臺/g, "台");
}

/** 從地址抓縣市（抓不到回傳空字串） */
export function countyFromAddress(address: string): string {
  const m = normalizeCounty(address).replace(/^\d{3,6}/, "").match(/^(.{2}[縣市])/);
  return m ? m[1] : "";
}

/**
 * 到府收貨：找出有到府能力、服務範圍涵蓋該縣市、收這些品類的夥伴。
 * 優先序：priority 小的優先；同優先序時選目前案件較少的。
 * 找不到回傳 null，交給平台管理員手動分派。
 */
export function assignPickupPartner(
  partners: PartnerForAssign[],
  slugs: string[],
  county: string,
): PartnerForAssign | null {
  const c = normalizeCounty(county);
  const candidates = partners.filter(
    (p) =>
      p.active &&
      p.pickupMode !== "none" &&
      acceptsAll(p, slugs) &&
      p.serviceAreas.map(normalizeCounty).includes(c),
  );
  candidates.sort((a, b) => a.priority - b.priority || a.openCases - b.openCases);
  return candidates[0] ?? null;
}
