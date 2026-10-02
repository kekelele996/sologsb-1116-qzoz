import type { Specimen, SpecimenCounts } from '@/types'

/** 统计某条目下各状态实物份数（图谱卡片与详情共用） */
export function getSpecimenCounts(specimens: Specimen[], recordId: string): SpecimenCounts {
  const own = specimens.filter((item) => item.recordId === recordId)
  const counts: SpecimenCounts = { total: 0, available: 0, lent: 0, scrapped: 0 }
  for (const item of own) {
    if (item.status === '在柜') counts.available += 1
    else if (item.status === '借出中') counts.lent += 1
    else counts.scrapped += 1
  }
  // 现存份数 = 在柜 + 借出中；已报废实物已出库，不计入剩余
  counts.total = counts.available + counts.lent
  return counts
}
