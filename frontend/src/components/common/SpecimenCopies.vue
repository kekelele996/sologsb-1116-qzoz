<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FungusRecord, SpecimenCopy } from '@/types'
import { useStore } from '@/hooks/usePersistentStore'
import { copyStore } from '@/stores/copyStore'
import { recordStore } from '@/stores/recordStore'
import { copyCountsOf } from '@/utils/copy'

const props = withDefaults(defineProps<{ recordId?: string; keyword?: string }>(), {
  recordId: '',
  keyword: ''
})

const copyState = useStore(copyStore)
const recordState = useStore(recordStore)

const today = new Date().toISOString().slice(0, 10)

/** 本组件展示的实物：指定条目时只看该条目，否则看全部 */
const visibleCopies = computed<SpecimenCopy[]>(() =>
  props.recordId
    ? copyState.copies.filter((item) => item.recordId === props.recordId)
    : copyState.copies
)

const counts = computed(() => ({
  total: visibleCopies.value.length,
  available: visibleCopies.value.filter((item) => item.status === '在柜').length,
  lent: visibleCopies.value.filter((item) => item.status === '借出中').length,
  scrapped: visibleCopies.value.filter((item) => item.status === '报废').length
}))

function recordOf(recordId: string): FungusRecord | undefined {
  return recordState.records.find((item) => item.id === recordId)
}

/** 全部视图下按条目分组展示，可按编号 / 暂定名 / 柜位号筛选 */
const groups = computed(() => {
  if (props.recordId) return []
  const keyword = props.keyword.trim().toLowerCase()
  const map = new Map<string, SpecimenCopy[]>()
  for (const copy of visibleCopies.value) {
    const record = recordOf(copy.recordId)
    if (
      keyword &&
      ![record?.code, record?.tempName, copy.cabinetNo, copy.copyNo]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    ) {
      continue
    }
    const list = map.get(copy.recordId) ?? []
    list.push(copy)
    map.set(copy.recordId, list)
  }
  return [...map.entries()].map(([recordId, copies]) => ({
    recordId,
    record: recordOf(recordId),
    copies
  }))
})

function statusType(status: SpecimenCopy['status']): 'success' | 'warning' | 'info' {
  if (status === '在柜') return 'success'
  if (status === '借出中') return 'warning'
  return 'info'
}

function fail(error: unknown): void {
  ElMessage.error(error instanceof Error ? error.message : '操作失败，请重试')
}

/* ---------- 新增入库 ---------- */
const addVisible = ref(false)
const addForm = reactive({ recordId: '', cabinetNo: '' })

function openAdd(): void {
  addForm.recordId = props.recordId || recordState.records[0]?.id || ''
  addForm.cabinetNo = ''
  addVisible.value = true
}

async function submitAdd(): Promise<void> {
  if (!addForm.recordId) {
    ElMessage.warning('请选择要入库的条目')
    return
  }
  try {
    const row = await copyStore.getState().addCopy(addForm.recordId, addForm.cabinetNo)
    ElMessage.success(`实物 ${row.copyNo} 已入库，柜位 ${row.cabinetNo}`)
    addVisible.value = false
  } catch (error) {
    fail(error) // 弹窗不关，保管按原表单重试；条目形态侧不受影响
  }
}

/* ---------- 调整柜位 ---------- */
const cabinetVisible = ref(false)
const cabinetForm = reactive({ copyId: '', cabinetNo: '' })

function openCabinet(copy: SpecimenCopy): void {
  cabinetForm.copyId = copy.id
  cabinetForm.cabinetNo = copy.cabinetNo
  cabinetVisible.value = true
}

async function submitCabinet(): Promise<void> {
  try {
    await copyStore.getState().updateCabinet(cabinetForm.copyId, cabinetForm.cabinetNo)
    ElMessage.success('柜位已调整')
    cabinetVisible.value = false
  } catch (error) {
    fail(error)
  }
}

/* ---------- 借出 ---------- */
const lendVisible = ref(false)
const lendForm = reactive({ copyId: '', lentTo: '', lendDate: today, note: '' })
const lendTarget = ref<SpecimenCopy | null>(null)

function openLend(copy: SpecimenCopy): void {
  lendTarget.value = copy
  lendForm.copyId = copy.id
  lendForm.lentTo = copy.lentTo || ''
  lendForm.lendDate = today
  lendForm.note = ''
  lendVisible.value = true
}

async function submitLend(): Promise<void> {
  try {
    await copyStore.getState().lend(lendForm.copyId, lendForm.lentTo, lendForm.lendDate, lendForm.note)
    ElMessage.success('已登记借出')
    lendVisible.value = false
  } catch (error) {
    fail(error)
  }
}

/* ---------- 归还 ---------- */
const returnVisible = ref(false)
const returnForm = reactive({ copyId: '', returnDate: today })
const returnTarget = ref<SpecimenCopy | null>(null)

function openReturn(copy: SpecimenCopy): void {
  returnTarget.value = copy
  returnForm.copyId = copy.id
  returnForm.returnDate = today
  returnVisible.value = true
}

async function submitReturn(): Promise<void> {
  try {
    await copyStore.getState().returnCopy(returnForm.copyId, returnForm.returnDate)
    ElMessage.success('已归还入柜')
    returnVisible.value = false
  } catch (error) {
    fail(error)
  }
}

/* ---------- 报废 ---------- */
const scrapVisible = ref(false)
const scrapForm = reactive({ copyId: '', scrapDate: today, reason: '' })

function openScrap(copy: SpecimenCopy): void {
  scrapForm.copyId = copy.id
  scrapForm.scrapDate = today
  scrapForm.reason = ''
  scrapVisible.value = true
}

async function submitScrap(): Promise<void> {
  try {
    await copyStore.getState().scrap(scrapForm.copyId, scrapForm.scrapDate, scrapForm.reason)
    ElMessage.success('已登记报废')
    scrapVisible.value = false
  } catch (error) {
    fail(error)
  }
}
</script>

<template>
  <div class="copy-panel">
    <div class="copy-summary">
      <el-tag type="success" effect="plain">在柜 {{ counts.available }}</el-tag>
      <el-tag type="warning" effect="plain">借出中 {{ counts.lent }}</el-tag>
      <el-tag type="info" effect="plain">报废 {{ counts.scrapped }}</el-tag>
      <span class="muted">共 {{ counts.total }} 份</span>
      <el-button size="small" type="primary" plain class="add-btn" @click="openAdd">新增实物入库</el-button>
    </div>

    <el-table v-if="props.recordId" :data="visibleCopies" border stripe size="small">
      <el-table-column prop="copyNo" label="份号" min-width="170" />
      <el-table-column prop="cabinetNo" label="柜位号" width="120" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }: { row: SpecimenCopy }">
          <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="借出记录" min-width="200">
        <template #default="{ row }: { row: SpecimenCopy }">
          <template v-if="row.status === '借出中' || row.returnDate">
            <span v-if="row.lentTo">借出人 {{ row.lentTo }} · </span>
            借出 {{ row.lendDate }}
            <template v-if="row.status === '借出中'">
              <span class="lend-active">（借出中）</span>
            </template>
            <template v-else> · 归还 {{ row.returnDate }}</template>
            <div v-if="row.lendNote" class="muted note-line">备注：{{ row.lendNote }}</div>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="报废记录" min-width="160">
        <template #default="{ row }: { row: SpecimenCopy }">
          <template v-if="row.status === '报废'">
            <div>报废 {{ row.scrapDate }}</div>
            <div v-if="row.scrapReason" class="muted note-line">原因：{{ row.scrapReason }}</div>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230">
        <template #default="{ row }: { row: SpecimenCopy }">
          <el-button v-if="row.status === '在柜'" size="small" type="primary" @click="openLend(row)">借出</el-button>
          <el-button v-if="row.status === '借出中'" size="small" type="success" @click="openReturn(row)">归还</el-button>
          <el-button
            v-if="row.status !== '报废'"
            size="small"
            @click="openCabinet(row)"
            :disabled="row.status !== '在柜'"
          >
            改柜位
          </el-button>
          <el-button v-if="row.status !== '报废'" size="small" type="danger" plain @click="openScrap(row)">报废</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-else class="copy-groups">
      <div v-for="group in groups" :key="group.recordId" class="copy-group">
        <div class="group-head">
          <span class="mono">{{ group.record?.code ?? '未知条目' }}</span>
          <span>{{ group.record?.tempName || '未命名条目' }}</span>
          <span class="muted">
            在柜 {{ copyCountsOf(group.copies, group.recordId).available }} ·
            借出 {{ copyCountsOf(group.copies, group.recordId).lent }} ·
            报废 {{ copyCountsOf(group.copies, group.recordId).scrapped }}
          </span>
        </div>
        <el-table :data="group.copies" border stripe size="small">
          <el-table-column prop="copyNo" label="份号" min-width="170" />
          <el-table-column prop="cabinetNo" label="柜位号" width="120" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }: { row: SpecimenCopy }">
              <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="借出记录" min-width="200">
            <template #default="{ row }: { row: SpecimenCopy }">
              <template v-if="row.status === '借出中' || row.returnDate">
                <span v-if="row.lentTo">借出人 {{ row.lentTo }} · </span>
                借出 {{ row.lendDate }}
                <template v-if="row.status === '借出中'">
                  <span class="lend-active">（借出中）</span>
                </template>
                <template v-else> · 归还 {{ row.returnDate }}</template>
                <div v-if="row.lendNote" class="muted note-line">备注：{{ row.lendNote }}</div>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="报废记录" min-width="160">
            <template #default="{ row }: { row: SpecimenCopy }">
              <template v-if="row.status === '报废'">
                <div>报废 {{ row.scrapDate }}</div>
                <div v-if="row.scrapReason" class="muted note-line">原因：{{ row.scrapReason }}</div>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230">
            <template #default="{ row }: { row: SpecimenCopy }">
              <el-button v-if="row.status === '在柜'" size="small" type="primary" @click="openLend(row)">借出</el-button>
              <el-button v-if="row.status === '借出中'" size="small" type="success" @click="openReturn(row)">归还</el-button>
              <el-button
                v-if="row.status !== '报废'"
                size="small"
                @click="openCabinet(row)"
                :disabled="row.status !== '在柜'"
              >
                改柜位
              </el-button>
              <el-button v-if="row.status !== '报废'" size="small" type="danger" plain @click="openScrap(row)">报废</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <el-empty v-if="groups.length === 0" description="暂无实物份，点击「新增实物」入库" />
    </div>

    <!-- 新增入库 -->
    <el-dialog v-model="addVisible" title="新增实物入库" width="440px">
      <el-form label-width="92px">
        <el-form-item label="所属条目" required>
          <el-select v-model="addForm.recordId" style="width: 100%" :disabled="!!props.recordId">
            <el-option
              v-for="record in recordState.records"
              :key="record.id"
              :label="`${record.code} ${record.tempName || ''}`"
              :value="record.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="柜位号" required>
          <el-input v-model="addForm.cabinetNo" placeholder="如 A-004，未报废实物间不可重复" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAdd">确认入库</el-button>
      </template>
    </el-dialog>

    <!-- 调整柜位 -->
    <el-dialog v-model="cabinetVisible" title="调整柜位" width="400px">
      <el-form label-width="92px">
        <el-form-item label="柜位号" required>
          <el-input v-model="cabinetForm.cabinetNo" placeholder="新柜位号，不可与在柜实物重复" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cabinetVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCabinet">保存柜位</el-button>
      </template>
    </el-dialog>

    <!-- 借出 -->
    <el-dialog v-model="lendVisible" title="借出登记" width="440px">
      <el-form label-width="92px">
        <el-form-item label="借出人" required>
          <el-input v-model="lendForm.lentTo" placeholder="如 祁野" />
        </el-form-item>
        <el-form-item label="借出日期" required>
          <el-date-picker v-model="lendForm.lendDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="lendForm.note" type="textarea" :rows="2" placeholder="借出用途、预计归还等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lendVisible = false">取消</el-button>
        <el-button type="primary" @click="submitLend">确认借出</el-button>
      </template>
    </el-dialog>

    <!-- 归还 -->
    <el-dialog v-model="returnVisible" title="归还登记" width="400px">
      <el-form label-width="92px">
        <el-form-item label="归还日期" required>
          <el-date-picker
            v-model="returnForm.returnDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
            :disabled-date="(d: Date) => !!returnTarget?.lendDate && d < new Date(returnTarget.lendDate)"
          />
        </el-form-item>
      </el-form>
      <p v-if="returnTarget?.lendDate" class="muted tip">
        借出日期 {{ returnTarget.lendDate }}，归还日期不得早于借出日期
      </p>
      <template #footer>
        <el-button @click="returnVisible = false">取消</el-button>
        <el-button type="success" @click="submitReturn">确认归还入柜</el-button>
      </template>
    </el-dialog>

    <!-- 报废 -->
    <el-dialog v-model="scrapVisible" title="报废登记" width="440px">
      <el-form label-width="92px">
        <el-form-item label="报废日期" required>
          <el-date-picker v-model="scrapForm.scrapDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="报废原因">
          <el-input v-model="scrapForm.reason" type="textarea" :rows="2" placeholder="如 虫蛀、霉变、遗失" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scrapVisible = false">取消</el-button>
        <el-button type="danger" @click="submitScrap">确认报废</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.copy-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.add-btn {
  margin-left: auto;
}
.muted {
  color: #7f8d82;
  font-size: 12px;
}
.note-line {
  margin-top: 2px;
}
.lend-active {
  color: #b8821f;
  font-weight: 600;
}
.tip {
  margin: 0 0 12px;
}
.copy-group {
  margin-bottom: 14px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-weight: 600;
}
</style>
