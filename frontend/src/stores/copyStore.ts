import { createStore } from 'zustand/vanilla'
import type { SpecimenCopy } from '@/types'
import { db, syncAll } from '@/hooks/usePersistentStore'
import { uid } from '@/utils/id'

export interface CopyState {
  copies: SpecimenCopy[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 新增一份在柜实物（入库），柜位号在未报废实物间唯一 */
  addCopy: (recordId: string, cabinetNo: string) => Promise<SpecimenCopy>
  /** 调整柜位（仅在柜实物可改） */
  updateCabinet: (copyId: string, cabinetNo: string) => Promise<void>
  /** 借出：仅在柜实物可借出 */
  lend: (copyId: string, lentTo: string, lendDate: string, note: string) => Promise<void>
  /** 归还：仅借出中实物可归还，且归还日期不得早于借出日期 */
  returnCopy: (copyId: string, returnDate: string) => Promise<void>
  /** 报废：在柜或借出中均可报废，报废后不可再借出 */
  scrap: (copyId: string, scrapDate: string, reason: string) => Promise<void>
  /** 删除条目时一并清理其实物份 */
  removeByRecord: (recordId: string) => Promise<void>
}

/** 柜位号规范化：去首尾空格，比较时忽略大小写 */
function normalizeCabinet(cabinetNo: string): string {
  return cabinetNo.trim().toLowerCase()
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export const copyStore = createStore<CopyState>((set, get) => {
  /** 取实物，不存在或已不属于该条目时抛出中文错误（当场拦住） */
  function requireCopy(copyId: string): SpecimenCopy {
    const copy = get().copies.find((item) => item.id === copyId)
    if (!copy) throw new Error('实物记录不存在，可能已被删除')
    return copy
  }

  /** 柜位号唯一性校验：未报废实物间不得重复 */
  function assertCabinetAvailable(cabinetNo: string, excludeId?: string): void {
    const target = normalizeCabinet(cabinetNo)
    if (!target) throw new Error('柜位号不能为空')
    const duplicated = get().copies.some(
      (item) =>
        item.id !== excludeId && item.status !== '报废' && normalizeCabinet(item.cabinetNo) === target
    )
    if (duplicated) throw new Error(`柜位号「${cabinetNo.trim()}」已被其他在柜实物占用，请换一个`)
  }

  return {
    copies: [],
    loaded: false,
    hydrate: async () => {
      const copies = await syncAll<SpecimenCopy>(db.copies)
      copies.sort((a, b) => (a.recordId + a.copyNo).localeCompare(b.recordId + b.copyNo, 'zh-Hans-CN'))
      set({ copies, loaded: true })
    },

    addCopy: async (recordId, cabinetNo) => {
      const cabinet = cabinetNo.trim()
      assertCabinetAvailable(cabinet)
      const siblings = get().copies.filter((item) => item.recordId === recordId)
      const record = await db.records.get(recordId)
      const baseNo = record?.code ?? recordId
      const row: SpecimenCopy = {
        id: uid('cpy'),
        recordId,
        copyNo: `${baseNo}-${siblings.length + 1}`,
        cabinetNo: cabinet,
        status: '在柜',
        lendDate: null,
        returnDate: null,
        lentTo: '',
        lendNote: '',
        scrapDate: null,
        scrapReason: '',
        stockedDate: today()
      }
      // 事务内完成入库写入，失败整体回滚，不留半截
      await db.transaction('rw', db.copies, async () => {
        await db.copies.add(row)
      })
      await get().hydrate()
      return row
    },

    updateCabinet: async (copyId, cabinetNo) => {
      const copy = requireCopy(copyId)
      if (copy.status !== '在柜') throw new Error(`实物当前「${copy.status}」，不能调整柜位`)
      const cabinet = cabinetNo.trim()
      assertCabinetAvailable(cabinet, copyId)
      await db.transaction('rw', db.copies, async () => {
        await db.copies.update(copyId, { cabinetNo: cabinet })
      })
      await get().hydrate()
    },

    lend: async (copyId, lentTo, lendDate, note) => {
      const copy = requireCopy(copyId)
      if (copy.status === '报废') throw new Error('该实物已报废，不能借出')
      if (copy.status !== '在柜') throw new Error(`实物当前「${copy.status}」，不能重复借出`)
      if (!lentTo.trim()) throw new Error('请填写借出人')
      if (!lendDate) throw new Error('请选择借出日期')
      await db.transaction('rw', db.copies, async () => {
        await db.copies.update(copyId, {
          status: '借出中',
          lendDate,
          lentTo: lentTo.trim(),
          lendNote: note.trim(),
          returnDate: null
        })
      })
      await get().hydrate()
    },

    returnCopy: async (copyId, returnDate) => {
      const copy = requireCopy(copyId)
      if (copy.status !== '借出中') throw new Error(`实物当前「${copy.status}」，无需归还`)
      if (!returnDate) throw new Error('请选择归还日期')
      if (copy.lendDate && returnDate < copy.lendDate) {
        throw new Error(`归还日期不能早于借出日期（借出 ${copy.lendDate}）`)
      }
      await db.transaction('rw', db.copies, async () => {
        await db.copies.update(copyId, { status: '在柜', returnDate })
      })
      await get().hydrate()
    },

    scrap: async (copyId, scrapDate, reason) => {
      const copy = requireCopy(copyId)
      if (copy.status === '报废') throw new Error('该实物已报废，无需重复操作')
      if (!scrapDate) throw new Error('请选择报废日期')
      await db.transaction('rw', db.copies, async () => {
        await db.copies.update(copyId, {
          status: '报废',
          scrapDate,
          scrapReason: reason.trim()
        })
      })
      await get().hydrate()
    },

    removeByRecord: async (recordId) => {
      const targets = get().copies.filter((item) => item.recordId === recordId)
      if (targets.length === 0) return
      await db.transaction('rw', db.copies, async () => {
        await Promise.all(targets.map((item) => db.copies.delete(item.id)))
      })
      await get().hydrate()
    }
  }
})
