/**
 * 數量拆分：一筆捐贈品項可以拆給多個需求；需求不足時記為部分媒合。
 */

export interface OpenNeedItem {
  needItemId: string;
  remaining: number;
  /** 越早截止越優先；沒有截止日排最後 */
  deadline: Date | null;
  createdAt: Date;
}

export interface Allocation {
  needItemId: string;
  quantity: number;
}

/** 依截止日、登記時間順序，把 available 分配給需求；回傳分配結果與剩餘數量 */
export function allocate(
  available: number,
  needs: OpenNeedItem[],
): { allocations: Allocation[]; leftover: number } {
  const sorted = [...needs]
    .filter((n) => n.remaining > 0)
    .sort((a, b) => {
      const da = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
      return da - db || a.createdAt.getTime() - b.createdAt.getTime();
    });
  const allocations: Allocation[] = [];
  let left = Math.max(0, Math.floor(available));
  for (const n of sorted) {
    if (left === 0) break;
    const q = Math.min(left, n.remaining);
    allocations.push({ needItemId: n.needItemId, quantity: q });
    left -= q;
  }
  return { allocations, leftover: left };
}
