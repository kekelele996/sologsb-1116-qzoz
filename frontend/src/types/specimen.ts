/** 标本实物状态 */
export const SPECIMEN_STATUSES = ['在柜', '借出中', '已报废'] as const
export type SpecimenStatus = (typeof SPECIMEN_STATUSES)[number]

/** 标本出入库事件类型 */
export const SPECIMEN_EVENT_TYPES = ['入库', '借出', '归还', '转柜', '报废'] as const
export type SpecimenEventType = (typeof SPECIMEN_EVENT_TYPES)[number]

/** Specimen 标本实物：一个图谱条目可对应多份实物，保管侧只管实物，不碰形态 */
export interface Specimen {
  id: string
  /** 所属图谱条目 */
  recordId: string
  /** 条目内份号（从 1 起） */
  seq: number
  /** 当前状态 */
  status: SpecimenStatus
  /** 柜位号，全库唯一；借出期间保留原柜位 */
  location: string
  /** 入库日期 */
  storedAt: string
  /** 借出人 */
  borrower: string
  /** 借出日期 */
  lentAt: string
  /** 应还日期（选填） */
  dueAt: string
  /** 最近归还日期 */
  returnedAt: string
  /** 报废日期 */
  scrappedAt: string
  /** 备注（报废原因等） */
  note: string
}

/** SpecimenEvent 出入库留痕：替代纸笔记，与实物状态在同一事务内写入 */
export interface SpecimenEvent {
  id: string
  specimenId: string
  recordId: string
  type: SpecimenEventType
  /** 事件日期（归还、借出、转柜、报废均以此记录） */
  date: string
  /** 经办人 */
  operator: string
  /** 说明（借出对象、柜位变更、报废原因等） */
  detail: string
}

/** 保管业务规则被违反时抛出；属于当场拦截，不应触发保存重试 */
export class SpecimenRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpecimenRuleError'
  }
}

/** 条目下实物份数统计 */
export interface SpecimenCounts {
  /** 现存份数（在柜 + 借出中，不含已报废） */
  total: number
  /** 在柜可用份数 */
  available: number
  /** 借出中份数 */
  lent: number
  /** 已报废份数（累计） */
  scrapped: number
}
