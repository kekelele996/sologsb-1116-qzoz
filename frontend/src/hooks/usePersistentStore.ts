import { onUnmounted, reactive } from 'vue'
import type { StoreApi } from 'zustand/vanilla'
import Dexie, { type Table } from 'dexie'
import type {
  CollectPoint,
  FungusRecord,
  IdentifyLog,
  SporePrint,
  Specimen,
  SpecimenEvent
} from '@/types'

/** IndexedDB 数据结构版本号 */
export const SCHEMA_VERSION = 3

export interface MetaRow {
  key: string
  value: number
}

/** Dexie 封装：条目 / 孢子印 / 采集点 / 鉴定结论 / 标本实物 / 出入库留痕 六张表 + 元数据表 */
class FungiGuideDb extends Dexie {
  records!: Table<FungusRecord, string>
  spores!: Table<SporePrint, string>
  points!: Table<CollectPoint, string>
  identifies!: Table<IdentifyLog, string>
  specimens!: Table<Specimen, string>
  specimenEvents!: Table<SpecimenEvent, string>
  meta!: Table<MetaRow, string>

  constructor() {
    super('gbfungiguide')
    this.version(1).stores({
      records: 'id, code, pointId, attachment',
      spores: 'id, recordId, color',
      points: 'id, name, substrate',
      identifies: 'id, recordId, conclusion',
      meta: 'key'
    })
    // v2：新增「菌肉变色反应」字段，迁移时为历史条目补齐默认值（不变色）
    this.version(2)
      .stores({
        records: 'id, code, pointId, attachment, capShape',
        spores: 'id, recordId, color, observeDate',
        points: 'id, name, substrate, vegetation',
        identifies: 'id, recordId, conclusion, date',
        meta: 'key'
      })
      .upgrade(async (tx) => {
        await tx
          .table<FungusRecord, string>('records')
          .toCollection()
          .modify((record) => {
            if (!record.fleshReaction) {
              record.fleshReaction = '不变色'
            }
          })
      })
    // v3：拆分标本保管侧——实物柜位 / 借出归还 / 报废与出入库留痕独立成表。
    // 旧数据没有实物记录，为每个已入库条目先补一份「在柜」实物。
    this.version(SCHEMA_VERSION)
      .stores({
        records: 'id, code, pointId, attachment, capShape',
        spores: 'id, recordId, color, observeDate',
        points: 'id, name, substrate, vegetation',
        identifies: 'id, recordId, conclusion, date',
        specimens: 'id, recordId, status, location',
        specimenEvents: 'id, specimenId, recordId, type, date',
        meta: 'key'
      })
      .upgrade(async (tx) => {
        const specimenTable = tx.table<Specimen, string>('specimens')
        const eventTable = tx.table<SpecimenEvent, string>('specimenEvents')
        const existingRecordIds = new Set((await specimenTable.toArray()).map((item) => item.recordId))
        const today = new Date().toISOString().slice(0, 10)
        const records = await tx.table<FungusRecord, string>('records').toArray()
        const specimens: Specimen[] = []
        const events: SpecimenEvent[] = []
        let slot = 1
        // 旧数据没有实物记录：为每个已入库条目补一份在柜实物，柜位顺序发放、保证不重复
        for (const record of records) {
          if (existingRecordIds.has(record.id)) continue
          const suffix = record.id.replace(/^rec_/, '')
          const location = `A-${String(slot).padStart(3, '0')}`
          slot += 1
          specimens.push({
            id: `spm_${suffix}`,
            recordId: record.id,
            seq: 1,
            status: '在柜',
            location,
            storedAt: record.collectDate || today,
            borrower: '',
            lentAt: '',
            dueAt: '',
            returnedAt: '',
            scrappedAt: '',
            note: '旧数据升级补录'
          })
          events.push({
            id: `spe_${suffix}_init`,
            specimenId: `spm_${suffix}`,
            recordId: record.id,
            type: '入库',
            date: record.collectDate || today,
            operator: record.collector || '',
            detail: `升级补录入柜，柜位 ${location}`
          })
        }
        if (specimens.length > 0) {
          await specimenTable.bulkAdd(specimens)
          await eventTable.bulkAdd(events)
        }
      })
  }
}

export const db = new FungiGuideDb()

/** 写入当前数据结构版本号 */
export async function stampDbVersion(): Promise<void> {
  await db.meta.put({ key: 'schemaVersion', value: SCHEMA_VERSION })
}

/** 读取整表 */
export async function syncAll<T extends object>(table: Table<T, string>): Promise<T[]> {
  return table.toArray()
}

/** 写入一条记录 */
export async function syncPut<T extends object>(table: Table<T, string>, row: T): Promise<void> {
  await table.put(row)
}

/** 删除一条记录 */
export async function syncDelete<T extends object>(table: Table<T, string>, id: string): Promise<void> {
  await table.delete(id)
}

/**
 * 保存失败后按侧重试：仅重试底层持久化层面的瞬时失败，
 * 业务规则错误（SpecimenRuleError 等当场拦截）不重试，避免把非法状态反复落库。
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  retries = 2,
  baseDelayMs = 300
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      const isRuleError =
        typeof error === 'object' && error !== null && (error as { name?: string }).name === 'SpecimenRuleError'
      if (isRuleError || attempt === retries) throw error
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)))
    }
  }
  throw lastError
}

/** 把 Zustand vanilla store 桥接到 Vue 响应式状态 */
export function useStore<T extends object>(store: StoreApi<T>): T {
  const state = reactive({ ...store.getState() }) as T
  const unsubscribe = store.subscribe((next: T) => {
    Object.assign(state, next)
  })
  onUnmounted(() => unsubscribe())
  return state
}

/** 首次打开写入示例数据，保证各页面进入即有事可做 */
export async function seedDemoData(): Promise<void> {
  const count = await db.points.count()
  if (count > 0) return

  const today = new Date().toISOString().slice(0, 10)

  await db.points.bulkPut([
    {
      id: 'pt_bhs',
      name: '百花山栎树林样线',
      longitude: 115.6218,
      latitude: 39.8152,
      altitude: 1420,
      vegetation: '针阔混交林',
      substrate: '落叶层',
      companionTrees: '辽东栎、油松',
      collectDate: today,
      collector: '沈禾'
    },
    {
      id: 'pt_yls',
      name: '云龙山腐木沟',
      longitude: 117.2841,
      latitude: 34.2615,
      altitude: 260,
      vegetation: '常绿阔叶林',
      substrate: '腐木',
      companionTrees: '麻栎、枫香',
      collectDate: today,
      collector: '沈禾'
    }
  ])

  await db.records.bulkPut([
    {
      id: 'rec_001',
      code: 'BHS-2026-001',
      tempName: '橙黄牛肝菌（暂定）',
      fruitBodyCount: 3,
      pointId: 'pt_bhs',
      capDiameter: 9.5,
      capShape: '半球形',
      capMargin: '全缘',
      capTexture: '绒状',
      fleshThickness: 2.1,
      fleshReaction: '缓慢变蓝',
      attachment: '直生',
      gillDensity: '中等',
      stipeLength: 7.4,
      stipeDiameter: 2.2,
      ring: '膜质菌环',
      volva: '无菌托',
      odor: '淡淡坚果味',
      hostTree: '辽东栎',
      collectDate: today,
      collector: '沈禾',
      note: '菌管层易剥离，仅作形态记录'
    },
    {
      id: 'rec_002',
      code: 'BHS-2026-002',
      tempName: '灰紫小伞（暂定）',
      fruitBodyCount: 6,
      pointId: 'pt_bhs',
      capDiameter: 4.2,
      capShape: '平展',
      capMargin: '波状',
      capTexture: '光滑',
      fleshThickness: 0.6,
      fleshReaction: '不变色',
      attachment: '离生',
      gillDensity: '密集',
      stipeLength: 6.8,
      stipeDiameter: 0.8,
      ring: '无菌环',
      volva: '无菌托',
      odor: '无明显气味',
      hostTree: '油松',
      collectDate: today,
      collector: '沈禾',
      note: '菌褶边缘略带紫晕'
    },
    {
      id: 'rec_003',
      code: 'YLS-2026-001',
      tempName: '褐褶韧革菌（暂定）',
      fruitBodyCount: 2,
      pointId: 'pt_yls',
      capDiameter: 12.6,
      capShape: '漏斗形',
      capMargin: '内卷',
      capTexture: '鳞片状',
      fleshThickness: 1.4,
      fleshReaction: '变褐',
      attachment: '延生',
      gillDensity: '稀疏',
      stipeLength: 3.2,
      stipeDiameter: 3.6,
      ring: '无菌环',
      volva: '无菌托',
      odor: '土腥味',
      hostTree: '麻栎',
      collectDate: today,
      collector: '祁野',
      note: '生于倒木侧面，质地木栓化'
    }
  ])

  await db.spores.bulkPut([
    {
      id: 'spo_001',
      recordId: 'rec_001',
      color: '淡黄',
      shape: '圆形印痕，边缘略散',
      hours: 12,
      observeDate: today,
      moisture: '子实体偏干，印痕较薄'
    },
    {
      id: 'spo_002',
      recordId: 'rec_002',
      color: '白色',
      shape: '圆形印痕，中心致密',
      hours: 8,
      observeDate: today,
      moisture: '新鲜子实体，印痕厚实'
    },
    {
      id: 'spo_003',
      recordId: 'rec_003',
      color: '粉褐',
      shape: '不规则印痕',
      hours: 24,
      observeDate: today,
      moisture: '木质化样本，印痕浅'
    }
  ])

  await db.identifies.bulkPut([
    {
      id: 'idf_001',
      recordId: 'rec_001',
      conclusion: 'Boletus sp.',
      basis: '形态特征',
      referenceBook: '《中国大型真菌》',
      referencePage: 'P.312',
      confidence: '低',
      needReview: true,
      reviewer: '祁野',
      date: today
    },
    {
      id: 'idf_002',
      recordId: 'rec_002',
      conclusion: 'Lepista sordida',
      basis: '孢子印',
      referenceBook: '《菌物图鉴》',
      referencePage: 'P.145',
      confidence: '中',
      needReview: false,
      reviewer: '祁野',
      date: today
    }
  ])

  await db.specimens.bulkPut([
    {
      id: 'spm_001_a',
      recordId: 'rec_001',
      seq: 1,
      status: '在柜',
      location: 'A-001',
      storedAt: today,
      borrower: '',
      lentAt: '',
      dueAt: '',
      returnedAt: '',
      scrappedAt: '',
      note: ''
    },
    {
      id: 'spm_001_b',
      recordId: 'rec_001',
      seq: 2,
      status: '借出中',
      location: 'A-002',
      storedAt: today,
      borrower: '林学院标本室',
      lentAt: today,
      dueAt: '',
      returnedAt: '',
      scrappedAt: '',
      note: ''
    },
    {
      id: 'spm_002_a',
      recordId: 'rec_002',
      seq: 1,
      status: '在柜',
      location: 'B-011',
      storedAt: today,
      borrower: '',
      lentAt: '',
      dueAt: '',
      returnedAt: '',
      scrappedAt: '',
      note: ''
    },
    {
      id: 'spm_003_a',
      recordId: 'rec_003',
      seq: 1,
      status: '已报废',
      location: 'C-废03',
      storedAt: today,
      borrower: '',
      lentAt: '',
      dueAt: '',
      returnedAt: '',
      scrappedAt: today,
      note: '木栓化样本霉变，无法继续保存'
    }
  ])

  await db.specimenEvents.bulkPut([
    {
      id: 'spe_001_a_in',
      specimenId: 'spm_001_a',
      recordId: 'rec_001',
      type: '入库',
      date: today,
      operator: '沈禾',
      detail: '实物采回入柜，柜位 A-001'
    },
    {
      id: 'spe_001_b_in',
      specimenId: 'spm_001_b',
      recordId: 'rec_001',
      type: '入库',
      date: today,
      operator: '沈禾',
      detail: '实物采回入柜，柜位 A-002'
    },
    {
      id: 'spe_001_b_out',
      specimenId: 'spm_001_b',
      recordId: 'rec_001',
      type: '借出',
      date: today,
      operator: '保管-周岑',
      detail: '借给 林学院标本室 比对孢子印'
    },
    {
      id: 'spe_002_a_in',
      specimenId: 'spm_002_a',
      recordId: 'rec_002',
      type: '入库',
      date: today,
      operator: '沈禾',
      detail: '实物采回入柜，柜位 B-011'
    },
    {
      id: 'spe_003_a_in',
      specimenId: 'spm_003_a',
      recordId: 'rec_003',
      type: '入库',
      date: today,
      operator: '祁野',
      detail: '实物采回入柜，柜位 C-废03'
    },
    {
      id: 'spe_003_a_scrap',
      specimenId: 'spm_003_a',
      recordId: 'rec_003',
      type: '报废',
      date: today,
      operator: '保管-周岑',
      detail: '木栓化样本霉变，无法继续保存'
    }
  ])
}
