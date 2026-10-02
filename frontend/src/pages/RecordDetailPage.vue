<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { CollectPoint, FungusRecord, SporeColor, SporePrint } from '@/types'
import { SPORE_COLORS } from '@/types'
import GeoPointForm from '@/components/common/GeoPointForm.vue'
import GillAttachmentTag from '@/components/common/GillAttachmentTag.vue'
import SporePrintSwatch from '@/components/common/SporePrintSwatch.vue'
import TraitsSummary from '@/components/common/TraitsSummary.vue'
import RecordTraitsForm from '@/components/common/RecordTraitsForm.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { pointStore } from '@/stores/pointStore'
import { identifyStore } from '@/stores/identifyStore'
import { specimenStore } from '@/stores/specimenStore'
import { sporeColorHex } from '@/utils/spore'
import { getSpecimenCounts } from '@/utils/specimen'
import { uid } from '@/utils/id'

const route = useRoute()
const router = useRouter()
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const pointState = useStore(pointStore)
const identifyState = useStore(identifyStore)
const specimenState = useStore(specimenStore)

const record = computed(() => recordState.records.find((item) => item.id === route.params.id) ?? null)
const spore = computed(() => sporeState.spores.find((item) => item.recordId === record.value?.id) ?? null)
const logs = computed(() => identifyState.logs.filter((item) => item.recordId === record.value?.id))
const specimens = computed(() =>
  specimenState.specimens
    .filter((item) => item.recordId === record.value?.id)
    .sort((a, b) => a.seq - b.seq)
)
/** 借出后图谱详情跟着显示可用 / 借出中份数 */
const counts = computed(() =>
  record.value ? getSpecimenCounts(specimenState.specimens, record.value.id) : {
    total: 0,
    available: 0,
    lent: 0,
    scrapped: 0
  }
)
/** 当前条目所属采集点名称（在脚本内取，避免模板内箭头函数丢失空值收窄） */
const recordPointName = computed(() => {
  const current = record.value
  if (!current) return '未关联'
  return pointState.points.find((item) => item.id === current.pointId)?.name ?? '未关联'
})

/* ---------- 采集人补形态：只写条目，不带走任何实物状态 ---------- */
const traitsVisible = ref(false)
const traitsDraft = reactive<FungusRecord>({
  id: '',
  code: '',
  tempName: '',
  fruitBodyCount: 1,
  pointId: '',
  capDiameter: 0,
  capShape: '平展',
  capMargin: '全缘',
  capTexture: '光滑',
  fleshThickness: 0,
  fleshReaction: '不变色',
  attachment: '直生',
  gillDensity: '中等',
  stipeLength: 0,
  stipeDiameter: 0,
  ring: '无菌环',
  volva: '无菌托',
  odor: '',
  hostTree: '',
  collectDate: '',
  collector: '',
  note: ''
})

function openTraits(): void {
  if (!record.value) return
  Object.assign(traitsDraft, record.value)
  traitsVisible.value = true
}

async function saveTraits(): Promise<void> {
  if (!record.value) return
  if (!traitsDraft.tempName.trim()) {
    ElMessage.warning('暂定名不能为空')
    return
  }
  // 仅落 records 表，实物柜位 / 借出归还状态完全不参与
  const next: FungusRecord = {
    ...record.value,
    ...traitsDraft,
    id: record.value.id,
    code: record.value.code,
    pointId: record.value.pointId,
    odor: traitsDraft.odor.trim(),
    hostTree: traitsDraft.hostTree.trim(),
    collector: traitsDraft.collector.trim(),
    note: traitsDraft.note.trim()
  }
  await recordStore.getState().save(next)
  traitsVisible.value = false
  ElMessage.success('形态已补录，实物状态不受影响')
}

const sporeForm = reactive({
  id: '',
  color: '白色' as SporeColor,
  shape: '',
  hours: 12,
  observeDate: new Date().toISOString().slice(0, 10),
  moisture: ''
})

const pointDraft = reactive<CollectPoint>({
  id: '',
  name: '',
  longitude: 0,
  latitude: 0,
  altitude: 0,
  vegetation: '针阔混交林',
  substrate: '落叶层',
  companionTrees: '',
  collectDate: '',
  collector: ''
})

watch(
  () => [record.value?.id, spore.value?.id, pointState.points.length] as const,
  () => {
    if (!record.value) return
    const current = spore.value
    if (current) {
      sporeForm.id = current.id
      sporeForm.color = current.color
      sporeForm.shape = current.shape
      sporeForm.hours = current.hours
      sporeForm.observeDate = current.observeDate
      sporeForm.moisture = current.moisture
    }
    const point = pointState.points.find((item) => item.id === record.value?.pointId)
    if (point) Object.assign(pointDraft, point)
  },
  { immediate: true }
)

async function saveSpore(): Promise<void> {
  if (!record.value) return
  const row: SporePrint = {
    id: sporeForm.id || uid('spo'),
    recordId: record.value.id,
    color: sporeForm.color,
    shape: sporeForm.shape.trim(),
    hours: Number(sporeForm.hours) || 0,
    observeDate: sporeForm.observeDate,
    moisture: sporeForm.moisture.trim()
  }
  await sporeStore.getState().save(row)
  sporeForm.id = row.id
  ElMessage.success(`孢子印观察已记录：${row.color}`)
}

async function savePoint(): Promise<void> {
  if (!pointDraft.name.trim()) {
    ElMessage.warning('采集点名称不能为空')
    return
  }
  await pointStore.getState().save({ ...pointDraft })
  ElMessage.success('采集点信息已更新')
}

async function removeSpore(): Promise<void> {
  if (!sporeForm.id) return
  await sporeStore.getState().remove(sporeForm.id)
  sporeForm.id = ''
  ElMessage.success('孢子印记录已删除')
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div v-if="record">
        <h2 class="page-title">{{ record.tempName || '未命名条目' }}</h2>
        <p class="page-sub">
          <span class="mono">{{ record.code }}</span> · 采集点
          {{ recordPointName }} · 采集日期
          {{ record.collectDate }} · 采集人 {{ record.collector || '—' }}
        </p>
      </div>
      <div v-else>
        <h2 class="page-title">条目详情</h2>
        <p class="page-sub">未找到该条目，可能已被删除。</p>
      </div>
      <div class="head-actions">
        <el-button @click="router.push('/atlas')">返回图谱</el-button>
        <el-button v-if="record" @click="router.push('/identify')">去鉴定</el-button>
      </div>
    </div>

    <template v-if="record">
      <el-card shadow="never" class="block">
        <template #header>
          <div class="block-head">
            <span>形态描述</span>
            <div class="head-right">
              <GillAttachmentTag :attachment="record.attachment" with-hint />
              <el-button size="small" @click="openTraits">补录 / 修改形态</el-button>
            </div>
          </div>
        </template>
        <TraitsSummary :record="record" :spore="spore" :default-open="['cap', 'flesh', 'gill', 'stipe', 'eco']" />
        <p v-if="record.note" class="note">现场备注：{{ record.note }}</p>
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>
          <div class="block-head">
            <span>标本实物（现存 {{ counts.total }} 份 · 已报废 {{ counts.scrapped }} 份）</span>
            <el-button size="small" @click="router.push(`/specimens?recordId=${record.id}`)">
              去标本保管操作
            </el-button>
          </div>
        </template>
        <div class="stock-summary">
          <el-tag type="success" effect="dark" size="large">在柜可用 {{ counts.available }} 份</el-tag>
          <el-tag :type="counts.lent > 0 ? 'warning' : 'info'" :effect="counts.lent > 0 ? 'dark' : 'plain'" size="large">
            借出中 {{ counts.lent }} 份
          </el-tag>
          <el-tag type="danger" effect="plain" size="large">已报废 {{ counts.scrapped }} 份</el-tag>
        </div>
        <el-table :data="specimens" border stripe size="small" class="specimen-table">
          <el-table-column label="份号" width="80">
            <template #default="{ row }">第 {{ row.seq }} 份</template>
          </el-table-column>
          <el-table-column prop="location" label="柜位号" width="110" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag
                :type="row.status === '在柜' ? 'success' : row.status === '借出中' ? 'warning' : 'danger'"
                size="small"
                :effect="row.status === '已报废' ? 'plain' : 'dark'"
              >
                {{ row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="出入库情况" min-width="220">
            <template #default="{ row }">
              <template v-if="row.status === '借出中'">
                {{ row.borrower }} 借于 {{ row.lentAt }}<template v-if="row.dueAt">，应还 {{ row.dueAt }}</template>
              </template>
              <template v-else-if="row.status === '已报废'">{{ row.scrappedAt }} 报废：{{ row.note }}</template>
              <template v-else>在库，入库 {{ row.storedAt }}</template>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="specimens.length === 0" description="该条目尚无实物记录，去「标本保管」入库" :image-size="60" />
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>
          <div class="block-head">
            <span>孢子印观察</span>
            <SporePrintSwatch :color="spore?.color ?? null" size="large" :caption="spore ? `获取 ${spore.hours} h` : '尚未记录'" />
          </div>
        </template>
        <div class="spore-body">
          <div class="spore-current" :style="{ background: spore ? sporeColorHex(spore.color) : '#f2f4f6' }">
            <div v-if="spore" class="spore-info">
              <p class="spore-color">{{ spore.color }}</p>
              <p class="spore-meta">印形：{{ spore.shape || '—' }}</p>
              <p class="spore-meta">时长：{{ spore.hours }} 小时 · 观察日期 {{ spore.observeDate }}</p>
              <p class="spore-meta">样本干湿度：{{ spore.moisture || '—' }}</p>
            </div>
            <p v-else class="spore-empty">该条目尚未登记孢子印观察</p>
          </div>
          <el-form label-width="92px" class="spore-form">
            <el-form-item label="印色">
              <el-select v-model="sporeForm.color" style="width: 100%">
                <el-option v-for="color in SPORE_COLORS" :key="color" :label="color" :value="color" />
              </el-select>
            </el-form-item>
            <el-form-item label="印形">
              <el-input v-model="sporeForm.shape" placeholder="如 圆形印痕，边缘略散" />
            </el-form-item>
            <el-form-item label="时长(h)">
              <el-input-number v-model="sporeForm.hours" :min="0" :step="1" :controls="false" style="width: 100%" />
            </el-form-item>
            <el-form-item label="观察日期">
              <el-date-picker v-model="sporeForm.observeDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
            <el-form-item label="干湿度">
              <el-input v-model="sporeForm.moisture" type="textarea" :rows="2" placeholder="如 子实体偏干，印痕较薄" />
            </el-form-item>
            <div class="form-actions">
              <el-button type="primary" @click="saveSpore">{{ sporeForm.id ? '更新孢子印' : '登记孢子印' }}</el-button>
              <el-button v-if="sporeForm.id" type="danger" plain @click="removeSpore">删除记录</el-button>
            </div>
          </el-form>
        </div>
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>采集点信息（含经纬度校验）</template>
        <GeoPointForm v-model="pointDraft" with-meta />
        <div class="form-actions">
          <el-button type="primary" @click="savePoint">保存采集点</el-button>
        </div>
      </el-card>

      <el-card shadow="never" class="block">
        <template #header>鉴定留痕（{{ logs.length }} 条）</template>
        <el-table :data="logs" border stripe>
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="conclusion" label="结论学名" min-width="160" />
          <el-table-column prop="basis" label="依据" width="110" />
          <el-table-column label="参考图鉴" min-width="180">
            <template #default="{ row }: { row: { referenceBook: string; referencePage: string } }">
              {{ row.referenceBook || '—' }} {{ row.referencePage }}
            </template>
          </el-table-column>
          <el-table-column prop="confidence" label="置信度" width="90" />
          <el-table-column label="复核" width="110">
            <template #default="{ row }: { row: { needReview: boolean; reviewer: string } }">
              <el-tag v-if="row.needReview" type="warning" size="small" effect="dark">待复核</el-tag>
              <span v-else class="muted">{{ row.reviewer || '已复核' }}</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="logs.length === 0" description="尚无鉴定结论，去「鉴定工作页」生成" />
      </el-card>

      <el-dialog v-model="traitsVisible" title="补录 / 修改形态（不影响实物状态）" width="720px">
        <el-form label-width="110px">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="采集编号">
                <el-input :model-value="record.code" disabled />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="暂定名" required>
                <el-input v-model="traitsDraft.tempName" placeholder="如 橙黄牛肝菌（暂定）" />
              </el-form-item>
            </el-col>
          </el-row>
          <RecordTraitsForm :model="traitsDraft" />
        </el-form>
        <template #footer>
          <el-button @click="traitsVisible = false">取消</el-button>
          <el-button type="primary" @click="saveTraits">保存形态</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 8px;
}
.block {
  border-radius: 12px;
  margin-bottom: 16px;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stock-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.specimen-table {
  margin-top: 4px;
}
.note {
  margin: 10px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f7f5f0;
  font-size: 12px;
  color: #6f7d72;
}
.spore-body {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.spore-current {
  flex: 1 1 260px;
  min-height: 180px;
  border-radius: 12px;
  border: 1px solid #e8e2d6;
  padding: 16px;
  display: flex;
  align-items: center;
}
.spore-info p {
  margin: 2px 0;
}
.spore-color {
  font-size: 20px;
  font-weight: 700;
}
.spore-meta {
  font-size: 12px;
  color: #4b5b50;
}
.spore-empty {
  font-size: 13px;
  color: #7f8d82;
}
.spore-form {
  flex: 1 1 320px;
}
.form-actions {
  display: flex;
  gap: 8px;
  padding-left: 92px;
}
</style>
