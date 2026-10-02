import type { SpecimenCopy } from '@/types'

/** 某条目的实物份数统计 */
export interface CopyCounts {
  /** 总份数 */
  total: number
  /** 在柜（可借）份数 */
  available: number
  /** 借出中份数 */
  lent: number
  /** 已报废份数 */
  scrapped: number
}

/** 从实物列表中统计指定条目的份数状态 */
export function copyCountsOf(copies: SpecimenCopy[], recordId: string): CopyCounts {
  const list = copies.filter((item) => item.recordId === recordId)
  return {
    total: list.length,
    available: list.filter((item) => item.status === '在柜').length,
    lent: list.filter((item) => item.status === '借出中').length,
    scrapped: list.filter((item) => item.status === '报废').length
  }
}
