/** 实物状态：在柜 / 借出中 / 报废 */
export const COPY_STATUSES = ['在柜', '借出中', '报废'] as const
export type CopyStatus = (typeof COPY_STATUSES)[number]

/** SpecimenCopy 实物份 —— 保管侧管理的最小单位，一个条目可有多份 */
export interface SpecimenCopy {
  id: string
  /** 所属条目 id */
  recordId: string
  /** 份号（同一条目内唯一，如 BHS-2026-001-1） */
  copyNo: string
  /** 柜位号（未报废实物间唯一） */
  cabinetNo: string
  status: CopyStatus
  /** 借出日期（YYYY-MM-DD），未借出为 null */
  lendDate: string | null
  /** 归还日期（YYYY-MM-DD），未归还为 null */
  returnDate: string | null
  /** 借出人 */
  lentTo: string
  /** 借出备注 */
  lendNote: string
  /** 报废日期（YYYY-MM-DD），未报废为 null */
  scrapDate: string | null
  /** 报废原因 */
  scrapReason: string
  /** 入库日期（YYYY-MM-DD） */
  stockedDate: string
}
