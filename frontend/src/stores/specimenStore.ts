import { createStore } from 'zustand/vanilla'
import type { Specimen, SpecimenEvent, SpecimenStatus } from '@/types'
import { SpecimenRuleError } from '@/types'
import { db, syncAll, withRetry } from '@/hooks/usePersistentStore'
import { uid } from '@/utils/id'

/** 新建实物时的入参（份号、状态与各日期由 store 维护） */
export interface SpecimenDraft {
  recordId: string
  location: string
  storedAt: string
  note?: string
}

export interface LendDraft {
  borrower: string
  lentAt: string
  dueAt?: string
  operator: string
}

export interface ReturnDraft {
  returnedAt: string
  operator: string
}

export interface RelocateDraft {
  location: string
  date: string
  operator: string
}

export interface ScrapDraft {
  date: string
  operator: string
  reason: string
}

export interface SpecimenState {
  specimens: Specimen[]
  events: SpecimenEvent[]
  loaded: boolean
  hydrate: () => Promise<void>
  create: (draft: SpecimenDraft) => Promise<Specimen>
  changeLocation: (specimenId: string, draft: RelocateDraft) => Promise<void>
  lend: (specimenId: string, draft: LendDraft) => Promise<void>
  returnBack: (specimenId: string, draft: ReturnDraft) => Promise<void>
  scrap: (specimenId: string, draft: ScrapDraft) => Promise<void>
  remove: (specimenId: string) => Promise<void>
  removeByRecord: (recordId: string) => Promise<void>
  eventsOf: (specimenId: string) => SpecimenEvent[]
}

/** 柜位是否被另一份「未报废」实物占用（报废后柜位即腾空） */
function locationOccupied(list: Specimen[], location: string, excludeId?: string): boolean {
  const normalized = location.trim()
  return list.some(
    (item) => item.status !== '已报废' && item.id !== excludeId && item.location.trim() === normalized
  )
}

function requireSpecimen(list: Specimen[], id: string): Specimen {
  const target = list.find((item) => item.id === id)
  if (!target) throw new SpecimenRuleError('该份实物不存在，可能已被清理')
  return target
}

function requireStatus(target: Specimen, expected: SpecimenStatus, verb: string): void {
  if (target.status !== expected) {
    throw new SpecimenRuleError(
      expected === '在柜'
        ? `第 ${target.seq} 份当前「${target.status}」，只有在柜实物才能${verb}`
        : `第 ${target.seq} 份当前「${target.status}」，无法${verb}`
    )
  }
}

export const specimenStore = createStore<SpecimenState>((set, get) => ({
  specimens: [],
  events: [],
  loaded: false,
  hydrate: async () => {
    const [specimens, events] = await withRetry(async () => {
      const rows = await Promise.all([
        syncAll<Specimen>(db.specimens),
        syncAll<SpecimenEvent>(db.specimenEvents)
      ])
      return rows
    })
    specimens.sort((a, b) =>
      a.recordId === b.recordId ? a.seq - b.seq : a.recordId.localeCompare(b.recordId)
    )
    events.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id))
    set({ specimens, events, loaded: true })
  },

  create: async (draft) => {
    const list = get().specimens
    if (!draft.recordId.trim()) throw new SpecimenRuleError('请选择要入库的图谱条目')
    if (!draft.location.trim()) throw new SpecimenRuleError('请填写柜位号')
    if (locationOccupied(list, draft.location)) {
      throw new SpecimenRuleError(`柜位号「${draft.location.trim()}」已被占用，请换一个柜位`)
    }
    const own = list.filter((item) => item.recordId === draft.recordId)
    const seq = own.reduce((max, item) => Math.max(max, item.seq), 0) + 1
    const specimen: Specimen = {
      id: uid('spm'),
      recordId: draft.recordId,
      seq,
      status: '在柜',
      location: draft.location.trim(),
      storedAt: draft.storedAt,
      borrower: '',
      lentAt: '',
      dueAt: '',
      returnedAt: '',
      scrappedAt: '',
      note: draft.note?.trim() ?? ''
    }
    const event: SpecimenEvent = {
      id: uid('spe'),
      specimenId: specimen.id,
      recordId: specimen.recordId,
      type: '入库',
      date: draft.storedAt,
      operator: '',
      detail: `实物采回入柜，柜位 ${specimen.location}`
    }
    // 状态与留痕同一事务写入，出入库不留半截
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimens.put(specimen)
        await db.specimenEvents.put(event)
      })
    )
    await get().hydrate()
    return specimen
  },

  changeLocation: async (specimenId, draft) => {
    const target = requireSpecimen(get().specimens, specimenId)
    requireStatus(target, '在柜', '调整柜位')
    if (!draft.location.trim()) throw new SpecimenRuleError('请填写新柜位号')
    if (locationOccupied(get().specimens, draft.location, target.id)) {
      throw new SpecimenRuleError(`柜位号「${draft.location.trim()}」已被占用，请换一个柜位`)
    }
    if (!draft.date) throw new SpecimenRuleError('请选择转柜日期')
    const from = target.location
    const next: Specimen = { ...target, location: draft.location.trim() }
    const event: SpecimenEvent = {
      id: uid('spe'),
      specimenId: target.id,
      recordId: target.recordId,
      type: '转柜',
      date: draft.date,
      operator: draft.operator.trim(),
      detail: `柜位 ${from} → ${draft.location.trim()}`
    }
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimens.put(next)
        await db.specimenEvents.put(event)
      })
    )
    await get().hydrate()
  },

  lend: async (specimenId, draft) => {
    const target = requireSpecimen(get().specimens, specimenId)
    // 已报废 / 借出中的实物都不能再借出
    if (target.status === '已报废') {
      throw new SpecimenRuleError(`第 ${target.seq} 份已报废，不能再借出`)
    }
    if (target.status === '借出中') {
      throw new SpecimenRuleError(`第 ${target.seq} 份已借出（借于 ${target.lentAt}），请先归还`)
    }
    if (!draft.borrower.trim()) throw new SpecimenRuleError('请填写借出人 / 借出对象')
    if (!draft.lentAt) throw new SpecimenRuleError('请选择借出日期')
    const next: Specimen = {
      ...target,
      status: '借出中',
      borrower: draft.borrower.trim(),
      lentAt: draft.lentAt,
      dueAt: draft.dueAt ?? '',
      returnedAt: '',
      scrappedAt: ''
    }
    const event: SpecimenEvent = {
      id: uid('spe'),
      specimenId: target.id,
      recordId: target.recordId,
      type: '借出',
      date: draft.lentAt,
      operator: draft.operator.trim(),
      detail: `借给 ${draft.borrower.trim()}${draft.dueAt ? `，应还 ${draft.dueAt}` : ''}`
    }
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimens.put(next)
        await db.specimenEvents.put(event)
      })
    )
    await get().hydrate()
  },

  returnBack: async (specimenId, draft) => {
    const target = requireSpecimen(get().specimens, specimenId)
    requireStatus(target, '借出中', '办理归还')
    if (!draft.returnedAt) throw new SpecimenRuleError('请选择归还日期')
    if (draft.returnedAt < target.lentAt) {
      throw new SpecimenRuleError(
        `归还日期 ${draft.returnedAt} 早于借出日期 ${target.lentAt}，不能登记归还`
      )
    }
    const next: Specimen = {
      ...target,
      status: '在柜',
      returnedAt: draft.returnedAt,
      borrower: '',
      lentAt: '',
      dueAt: ''
    }
    const event: SpecimenEvent = {
      id: uid('spe'),
      specimenId: target.id,
      recordId: target.recordId,
      type: '归还',
      date: draft.returnedAt,
      operator: draft.operator.trim(),
      detail: '归还回柜'
    }
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimens.put(next)
        await db.specimenEvents.put(event)
      })
    )
    await get().hydrate()
  },

  scrap: async (specimenId, draft) => {
    const target = requireSpecimen(get().specimens, specimenId)
    if (target.status === '已报废') {
      throw new SpecimenRuleError(`第 ${target.seq} 份已报废，无需重复报废`)
    }
    if (target.status === '借出中') {
      throw new SpecimenRuleError(`第 ${target.seq} 份尚在借出中，请先办理归还再报废`)
    }
    if (!draft.date) throw new SpecimenRuleError('请选择报废日期')
    if (!draft.reason.trim()) throw new SpecimenRuleError('请填写报废原因')
    const next: Specimen = {
      ...target,
      status: '已报废',
      scrappedAt: draft.date,
      note: draft.reason.trim()
    }
    const event: SpecimenEvent = {
      id: uid('spe'),
      specimenId: target.id,
      recordId: target.recordId,
      type: '报废',
      date: draft.date,
      operator: draft.operator.trim(),
      detail: draft.reason.trim()
    }
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimens.put(next)
        await db.specimenEvents.put(event)
      })
    )
    await get().hydrate()
  },

  remove: async (specimenId) => {
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimenEvents.where('specimenId').equals(specimenId).delete()
        await db.specimens.delete(specimenId)
      })
    )
    await get().hydrate()
  },

  removeByRecord: async (recordId) => {
    await withRetry(() =>
      db.transaction('rw', db.specimens, db.specimenEvents, async () => {
        await db.specimenEvents.where('recordId').equals(recordId).delete()
        await db.specimens.where('recordId').equals(recordId).delete()
      })
    )
    await get().hydrate()
  },

  eventsOf: (specimenId) =>
    get()
      .events.filter((item) => item.specimenId === specimenId)
      .sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
}))
