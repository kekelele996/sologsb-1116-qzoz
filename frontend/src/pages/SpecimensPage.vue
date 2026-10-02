<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type {
  FungusRecord,
  Specimen,
  SpecimenEvent,
  SpecimenEventType,
  SpecimenStatus
} from '@/types'
import { SpecimenRuleError } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { recordStore } from '@/stores/recordStore'
import { specimenStore } from '@/stores/specimenStore'

const route = useRoute()
const recordState = useStore(recordStore)
const specimenState = useStore(specimenStore)

const today = new Date().toISOString().slice(0, 10)

const filterRecordId = ref<string>((route.query.recordId as string | undefined) ?? '')
const filterStatus = ref<SpecimenStatus | ''>('')
const keyword = ref('')

const EVENT_TAG: Record<SpecimenEventType, 'success' | 'warning' | 'primary' | 'info' | 'danger'> = {
  入库: 'success',
  借出: 'warning',
  归还: 'primary',
  转柜: 'info',
  报废: 'danger'
}

interface Row {
  specimen: Specimen
  record: FungusRecord | null
}

/** 台账列表：条目名 + 实物状态，支持按条目 / 状态 / 柜位或借出人关键字过滤 */
const rows = computed<Row[]>(() => {
  const text = keyword.value.trim().toLowerCase()
  return specimenState.specimens
    .filter((specimen) => {
      if (filterRecordId.value && specimen.recordId !== filterRecordId.value) return false
      if (filterStatus.value && specimen.status !== filterStatus.value) return false
      if (text) {
        const record = recordState.records.find((item) => item.id === specimen.recordId)
        const haystack = [
          specimen.location,
          specimen.borrower,
          specimen.note,
          record?.code ?? '',
          record?.tempName ?? ''
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(text)) return false
      }
      return true
    })
    .map((specimen) => ({
      specimen,
      record: recordState.records.find((item) => item.id === specimen.recordId) ?? null
    }))
})

const totals = computed(() => {
  const all = specimenState.specimens
  return {
    specimens: all.length,
    available: all.filter((item) => item.status === '在柜').length,
    lent: all.filter((item) => item.status === '借出中').length,
    scrapped: all.filter((item) => item.status === '已报废').length,
    records: recordState.records.length
  }
})

function recordLabel(recordId: string): string {
  const record = recordState.records.find((item) => item.id === recordId)
  return record ? `${record.code} · ${record.tempName || '未命名'}` : '条目已删除'
}

/** 保管动作统一兜底：业务规则当场拦下并提示；底层保存失败已在 store 侧重试 */
async function run(action: () => Promise<void>): Promise<boolean> {
  try {
    await action()
    return true
  } catch (error) {
    if (error instanceof SpecimenRuleError) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error('保存失败，已按保管侧重试仍未成功，请稍后再试')
    }
    return false
  }
}

/* ---------- 入库 ---------- */
const createVisible = ref(false)
const createForm = reactive({
  recordId: '',
  location: '',
  storedAt: today,
  note: ''
})

function openCreate(): void {
  createForm.recordId = filterRecordId.value || recordState.records[0]?.id || ''
  createForm.location = ''
  createForm.storedAt = today
  createForm.note = ''
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const ok = await run(async () => {
    const specimen = await specimenStore.getState().create({
      recordId: createForm.recordId,
      location: createForm.location,
      storedAt: createForm.storedAt,
      note: createForm.note
    })
    ElMessage.success(`第 ${specimen.seq} 份实物已入柜 ${specimen.location}`)
  })
  if (ok) createVisible.value = false
}

/* ---------- 借出 / 归还 / 转柜 / 报废 ---------- */
type DialogKind = 'lend' | 'return' | 'relocate' | 'scrap'
const dialogKind = ref<DialogKind>('lend')
const actionVisible = ref(false)
const actionTarget = ref<Specimen | null>(null)
const actionForm = reactive({
  borrower: '',
  lentAt: today,
  dueAt: '',
  returnedAt: today,
  location: '',
  date: today,
  operator: '',
  reason: ''
})

const dialogTitle = computed(() => {
  const seq = actionTarget.value ? `第 ${actionTarget.value.seq} 份` : ''
  switch (dialogKind.value) {
    case 'lend':
      return `借出登记 · ${seq}`
    case 'return':
      return `归还登记 · ${seq}`
    case 'relocate':
      return `调整柜位 · ${seq}`
    case 'scrap':
      return `报废登记 · ${seq}`
  }
})

function openAction(kind: DialogKind, specimen: Specimen): void {
  dialogKind.value = kind
  actionTarget.value = specimen
  actionForm.borrower = kind === 'lend' ? '' : specimen.borrower
  actionForm.lentAt = today
  actionForm.dueAt = specimen.dueAt
  actionForm.returnedAt = today
  actionForm.location = kind === 'relocate' ? specimen.location : ''
  actionForm.date = today
  actionForm.operator = ''
  actionForm.reason = ''
  actionVisible.value = true
}

async function submitAction(): Promise<void> {
  const target = actionTarget.value
  if (!target) return
  const ok = await run(async () => {
    const store = specimenStore.getState()
    if (dialogKind.value === 'lend') {
      await store.lend(target.id, {
        borrower: actionForm.borrower,
        lentAt: actionForm.lentAt,
        dueAt: actionForm.dueAt,
        operator: actionForm.operator
      })
      ElMessage.success('借出已登记，图谱可用份数已更新')
    } else if (dialogKind.value === 'return') {
      await store.returnBack(target.id, {
        returnedAt: actionForm.returnedAt,
        operator: actionForm.operator
      })
      ElMessage.success('归还已登记，实物回柜')
    } else if (dialogKind.value === 'relocate') {
      await store.changeLocation(target.id, {
        location: actionForm.location,
        date: actionForm.date,
        operator: actionForm.operator
      })
      ElMessage.success('柜位已调整')
    } else {
      await store.scrap(target.id, {
        date: actionForm.date,
        operator: actionForm.operator,
        reason: actionForm.reason
      })
      ElMessage.success('已报废登记，柜位腾空')
    }
  })
  if (ok) actionVisible.value = false
}

/* ---------- 出入库留痕 ---------- */
const ledgerVisible = ref(false)
const ledgerSpecimen = ref<Specimen | null>(null)
const ledgerEvents = ref<SpecimenEvent[]>([])

function openLedger(specimen: Specimen): void {
  ledgerSpecimen.value = specimen
  ledgerEvents.value = specimenStore.getState().eventsOf(specimen.id)
  ledgerVisible.value = true
}

async function removeSpecimen(specimen: Specimen): Promise<void> {
  await ElMessageBox.confirm(
    `确认删除「${recordLabel(specimen.recordId)}」第 ${specimen.seq} 份实物？其全部出入库留痕一并删除`,
    '删除确认',
    { type: 'warning' }
  )
  const ok = await run(() => specimenStore.getState().remove(specimen.id))
  if (ok) ElMessage.success('实物记录已删除')
}

/** 该条目累计登记过的实物份数（含已报废，仅用于入库提示下一份） */
function existingCount(recordId: string): number {
  return specimenState.specimens.filter((item) => item.recordId === recordId).length
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">标本保管</h2>
        <p class="page-sub">
          只管每份实物的柜位、借出归还与报废，不动条目形态 / 孢子印 / 鉴定；一个条目可对应多份实物。
          归还早于借出、柜位号重复、报废后再借出都会当场拦下，状态与留痕同事务写入。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>实物入库
      </el-button>
    </div>

    <div class="stat-strip">
      <el-tag effect="plain" size="large">条目 {{ totals.records }}</el-tag>
      <el-tag type="info" effect="plain" size="large">实物共 {{ totals.specimens }} 份</el-tag>
      <el-tag type="success" effect="dark" size="large">在柜 {{ totals.available }}</el-tag>
      <el-tag type="warning" effect="dark" size="large">借出中 {{ totals.lent }}</el-tag>
      <el-tag type="danger" effect="plain" size="large">已报废 {{ totals.scrapped }}</el-tag>
    </div>

    <div class="toolbar">
      <el-select v-model="filterRecordId" placeholder="全部条目" clearable filterable style="width: 260px">
        <el-option
          v-for="record in recordState.records"
          :key="record.id"
          :label="`${record.code} · ${record.tempName || '未命名'}`"
          :value="record.id"
        />
      </el-select>
      <el-select v-model="filterStatus" placeholder="全部状态" clearable style="width: 140px">
        <el-option label="在柜" value="在柜" />
        <el-option label="借出中" value="借出中" />
        <el-option label="已报废" value="已报废" />
      </el-select>
      <el-input v-model="keyword" placeholder="柜位号 / 借出人 / 备注 / 编号" clearable style="width: 280px" />
      <el-tag type="info" effect="plain">列出 {{ rows.length }} 份</el-tag>
      <el-button
        v-if="filterRecordId || filterStatus || keyword"
        @click="(() => { filterRecordId = ''; filterStatus = ''; keyword = '' })()"
      >
        清空条件
      </el-button>
    </div>

    <el-table :data="rows" border stripe class="ledger">
      <el-table-column label="条目" min-width="220">
        <template #default="{ row }: { row: Row }">
          <div class="rec-cell">
            <span class="mono">{{ row.record?.code ?? '—' }}</span>
            <span>{{ row.record?.tempName || '未命名条目' }}</span>
            <el-tag v-if="!row.record" type="danger" size="small" effect="plain">条目缺失</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="份号" width="70">
        <template #default="{ row }: { row: Row }">第 {{ row.specimen.seq }} 份</template>
      </el-table-column>
      <el-table-column prop="specimen.location" label="柜位号" width="110" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: Row }">
          <el-tag
            :type="row.specimen.status === '在柜' ? 'success' : row.specimen.status === '借出中' ? 'warning' : 'danger'"
            size="small"
            :effect="row.specimen.status === '已报废' ? 'plain' : 'dark'"
          >
            {{ row.specimen.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="借出信息" min-width="200">
        <template #default="{ row }: { row: Row }">
          <template v-if="row.specimen.status === '借出中'">
            <div>{{ row.specimen.borrower }} · 借于 {{ row.specimen.lentAt }}</div>
            <div v-if="row.specimen.dueAt" class="muted">应还 {{ row.specimen.dueAt }}</div>
          </template>
          <template v-else-if="row.specimen.status === '已报废'">
            <span class="muted">{{ row.specimen.scrappedAt }} 报废：{{ row.specimen.note }}</span>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="specimen.storedAt" label="入库日期" width="115" />
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }: { row: Row }">
          <el-button
            size="small"
            type="warning"
            :disabled="row.specimen.status !== '在柜'"
            @click="openAction('lend', row.specimen)"
          >
            借出
          </el-button>
          <el-button
            size="small"
            type="primary"
            :disabled="row.specimen.status !== '借出中'"
            @click="openAction('return', row.specimen)"
          >
            归还
          </el-button>
          <el-button
            size="small"
            :disabled="row.specimen.status !== '在柜'"
            @click="openAction('relocate', row.specimen)"
          >
            转柜
          </el-button>
          <el-button
            size="small"
            type="danger"
            plain
            :disabled="row.specimen.status === '已报废'"
            @click="openAction('scrap', row.specimen)"
          >
            报废
          </el-button>
          <el-button size="small" link @click="openLedger(row.specimen)">留痕</el-button>
          <el-button size="small" type="danger" link @click="removeSpecimen(row.specimen)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>暂无实物记录，点右上角「实物入库」补录</template>
    </el-table>

    <!-- 入库 -->
    <el-dialog v-model="createVisible" title="实物入库（新增一份）" width="520px">
      <el-form label-width="92px">
        <el-form-item label="所属条目" required>
          <el-select v-model="createForm.recordId" filterable style="width: 100%">
            <el-option
              v-for="record in recordState.records"
              :key="record.id"
              :label="`${record.code} · ${record.tempName || '未命名'}`"
              :value="record.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createForm.recordId" label="已有份数">
          <span class="muted">该条目已累计登记 {{ existingCount(createForm.recordId) }} 份实物，本次入库为新一份</span>
        </el-form-item>
        <el-form-item label="柜位号" required>
          <el-input v-model="createForm.location" placeholder="如 A-101，未报废实物柜位不可重复" />
        </el-form-item>
        <el-form-item label="入库日期" required>
          <el-date-picker v-model="createForm.storedAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createForm.note" type="textarea" :rows="2" placeholder="标本保存方式等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">确认入库</el-button>
      </template>
    </el-dialog>

    <!-- 借出 / 归还 / 转柜 / 报废 -->
    <el-dialog v-model="actionVisible" :title="dialogTitle" width="500px">
      <el-form label-width="92px">
        <template v-if="dialogKind === 'lend'">
          <el-form-item label="借给谁" required>
            <el-input v-model="actionForm.borrower" placeholder="借出人 / 单位，如 林学院标本室" />
          </el-form-item>
          <el-form-item label="借出日期" required>
            <el-date-picker v-model="actionForm.lentAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="应还日期">
            <el-date-picker v-model="actionForm.dueAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="经办人">
            <el-input v-model="actionForm.operator" placeholder="保管经办人" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'return'">
          <p class="muted dialog-hint">借出日期：{{ actionTarget?.lentAt }} · 借出人：{{ actionTarget?.borrower }}</p>
          <el-form-item label="归还日期" required>
            <el-date-picker
              v-model="actionForm.returnedAt"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="经办人">
            <el-input v-model="actionForm.operator" placeholder="保管经办人" />
          </el-form-item>
        </template>
        <template v-else-if="dialogKind === 'relocate'">
          <el-form-item label="新柜位号" required>
            <el-input v-model="actionForm.location" placeholder="未报废实物柜位不可重复" />
          </el-form-item>
          <el-form-item label="转柜日期" required>
            <el-date-picker v-model="actionForm.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="经办人">
            <el-input v-model="actionForm.operator" placeholder="保管经办人" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="报废日期" required>
            <el-date-picker v-model="actionForm.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="报废原因" required>
            <el-input v-model="actionForm.reason" type="textarea" :rows="2" placeholder="如 霉变、虫蛀" />
          </el-form-item>
          <el-form-item label="经办人">
            <el-input v-model="actionForm.operator" placeholder="保管经办人" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAction">确认</el-button>
      </template>
    </el-dialog>

    <!-- 出入库留痕 -->
    <el-drawer v-model="ledgerVisible" title="出入库留痕" size="420px">
      <template v-if="ledgerSpecimen">
        <p class="muted">
          {{ recordLabel(ledgerSpecimen.recordId) }} · 第 {{ ledgerSpecimen.seq }} 份 · 当前
          {{ ledgerSpecimen.status }} · 柜位 {{ ledgerSpecimen.location }}
        </p>
        <el-timeline v-if="ledgerEvents.length > 0">
          <el-timeline-item
            v-for="event in ledgerEvents"
            :key="event.id"
            :type="EVENT_TAG[event.type]"
            :timestamp="`${event.date}${event.operator ? ' · ' + event.operator : ''}`"
          >
            <el-tag :type="EVENT_TAG[event.type]" size="small" effect="plain">{{ event.type }}</el-tag>
            <span class="event-detail">{{ event.detail || '—' }}</span>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="该份实物尚无出入库记录" />
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.ledger {
  border-radius: 12px;
}
.rec-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dialog-hint {
  margin: 0 0 12px 92px;
}
.event-detail {
  margin-left: 8px;
  font-size: 13px;
}
</style>
