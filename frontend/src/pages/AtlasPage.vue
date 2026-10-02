<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FungusRecord, GillAttachment, SporeColor } from '@/types'
import { GILL_ATTACHMENTS, SPORE_COLORS } from '@/types'
import GillAttachmentTag from '@/components/common/GillAttachmentTag.vue'
import SporePrintSwatch from '@/components/common/SporePrintSwatch.vue'
import TraitsSummary from '@/components/common/TraitsSummary.vue'
import RecordTraitsForm from '@/components/common/RecordTraitsForm.vue'
import { useStore } from '@/hooks/usePersistentStore'
import { useCandidateMatch, EMPTY_CRITERIA, type MatchCriteria } from '@/hooks/useCandidateMatch'
import { recordStore } from '@/stores/recordStore'
import { sporeStore } from '@/stores/sporeStore'
import { pointStore } from '@/stores/pointStore'
import { identifyStore } from '@/stores/identifyStore'
import { specimenStore } from '@/stores/specimenStore'
import { getSpecimenCounts } from '@/utils/specimen'
import { uid } from '@/utils/id'

const router = useRouter()
const recordState = useStore(recordStore)
const sporeState = useStore(sporeStore)
const pointState = useStore(pointStore)
const identifyState = useStore(identifyStore)
const specimenState = useStore(specimenStore)

const filterAttachment = ref<GillAttachment | ''>('')
const filterColor = ref<SporeColor | ''>('')
const keyword = ref('')
const compareIds = ref<string[]>([])

const criteria = computed<MatchCriteria>(() => ({
  ...EMPTY_CRITERIA,
  attachment: filterAttachment.value,
  sporeColor: filterColor.value
}))
const { candidates } = useCandidateMatch(
  computed(() => recordState.records),
  computed(() => sporeState.spores),
  criteria
)

/** 图谱筛选：印色 + 着生方式 + 关键字（未设条件时按编号排序） */
const visible = computed(() => {
  if (!filterAttachment.value && !filterColor.value && !keyword.value.trim()) {
    return recordState.records.map((record) => ({
      record,
      spore: sporeState.spores.find((item) => item.recordId === record.id) ?? null,
      percent: 0,
      matched: [] as string[]
    }))
  }
  const text = keyword.value.trim().toLowerCase()
  return candidates.value
    .filter((item) => {
      if (filterAttachment.value && item.record.attachment !== filterAttachment.value) return false
      if (filterColor.value && item.spore?.color !== filterColor.value) return false
      if (text) {
        const haystack = [item.record.code, item.record.tempName, item.record.hostTree, item.record.collector]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(text)) return false
      }
      return true
    })
    .map((item) => ({ record: item.record, spore: item.spore, percent: item.percent, matched: item.matched }))
})

function pointName(pointId: string): string {
  return pointState.points.find((point) => point.id === pointId)?.name ?? '未关联采集点'
}

function identifyOf(recordId: string): { conclusion: string; confidence: string; needReview: boolean } | null {
  const log = identifyState.logs.find((item) => item.recordId === recordId)
  return log ? { conclusion: log.conclusion, confidence: log.confidence, needReview: log.needReview } : null
}

function toggleCompare(id: string): void {
  compareIds.value = compareIds.value.includes(id)
    ? compareIds.value.filter((item) => item !== id)
    : compareIds.value.length >= 3
      ? compareIds.value
      : [...compareIds.value, id]
  if (compareIds.value.length >= 3) ElMessage.info('对比视图最多并排 3 条')
}

function goCompare(): void {
  if (compareIds.value.length < 2) {
    ElMessage.warning('至少选择 2 条才能对比')
    return
  }
  void router.push({ path: '/compare', query: { ids: compareIds.value.join(',') } })
}

/* ---------- 新建条目 ---------- */
const dialogVisible = ref(false)
const form = reactive({
  code: '',
  tempName: '',
  pointId: '',
  traits: {
    fruitBodyCount: 1,
    capDiameter: 5,
    capShape: '平展' as FungusRecord['capShape'],
    capMargin: '全缘' as FungusRecord['capMargin'],
    capTexture: '光滑' as FungusRecord['capTexture'],
    fleshThickness: 1,
    fleshReaction: '不变色' as FungusRecord['fleshReaction'],
    attachment: '直生' as GillAttachment,
    gillDensity: '中等' as FungusRecord['gillDensity'],
    stipeLength: 5,
    stipeDiameter: 1,
    ring: '无菌环' as FungusRecord['ring'],
    volva: '无菌托' as FungusRecord['volva'],
    odor: '',
    hostTree: '',
    collectDate: new Date().toISOString().slice(0, 10),
    collector: '',
    note: ''
  }
})

watch(
  () => [pointState.points.length, form.pointId] as const,
  () => {
    if (!form.pointId && pointState.points.length > 0) form.pointId = pointState.points[0].id
  },
  { immediate: true }
)

function openCreate(): void {
  form.code = `REC-${String(recordState.records.length + 1).padStart(3, '0')}`
  form.tempName = ''
  form.traits.note = ''
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!form.code.trim()) {
    ElMessage.warning('请填写采集编号')
    return
  }
  if (!form.pointId) {
    ElMessage.warning('请选择采集点')
    return
  }
  if (recordState.records.some((item) => item.code === form.code.trim())) {
    ElMessage.warning(`采集编号「${form.code}」已存在，请换一个`)
    return
  }
  const traits = form.traits
  const record: FungusRecord = {
    id: uid('rec'),
    code: form.code.trim(),
    tempName: form.tempName.trim(),
    pointId: form.pointId,
    fruitBodyCount: Number(traits.fruitBodyCount) || 1,
    capDiameter: Number(traits.capDiameter) || 0,
    capShape: traits.capShape,
    capMargin: traits.capMargin,
    capTexture: traits.capTexture,
    fleshThickness: Number(traits.fleshThickness) || 0,
    fleshReaction: traits.fleshReaction,
    attachment: traits.attachment,
    gillDensity: traits.gillDensity,
    stipeLength: Number(traits.stipeLength) || 0,
    stipeDiameter: Number(traits.stipeDiameter) || 0,
    ring: traits.ring,
    volva: traits.volva,
    odor: traits.odor.trim(),
    hostTree: traits.hostTree.trim(),
    collectDate: traits.collectDate,
    collector: traits.collector.trim(),
    note: traits.note.trim()
  }
  await recordStore.getState().save(record)
  dialogVisible.value = false
  ElMessage.success(`条目 ${record.code} 已建立，实物入库请在「标本保管」中登记`)
}

async function removeRecord(record: FungusRecord): Promise<void> {
  await ElMessageBox.confirm(
    `确认删除条目「${record.code}」？其孢子印、鉴定留痕与全部实物出入库记录一并清理`,
    '删除确认',
    {
      type: 'warning'
    }
  )
  await sporeStore.getState().removeByRecord(record.id)
  const logs = identifyState.logs.filter((item) => item.recordId === record.id)
  await Promise.all(logs.map((item) => identifyStore.getState().remove(item.id)))
  await specimenStore.getState().removeByRecord(record.id)
  await recordStore.getState().remove(record.id)
  ElMessage.success('条目已删除')
}

/** 卡片上的实物份数：可用（在柜）/ 借出中 */
function stockOf(recordId: string): { available: number; lent: number } {
  return getSpecimenCounts(specimenState.specimens, recordId)
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">图谱总览</h2>
        <p class="page-sub">
          网格卡片展示菌盖形态要点、孢子印色块与鉴定状态；可按孢子印印色与菌褶/菌管着生方式筛选（同时作为候选排序条件）。
        </p>
      </div>
      <div class="head-actions">
        <el-button v-if="compareIds.length > 0" type="primary" plain @click="goCompare">
          对比已选 {{ compareIds.length }} 条
        </el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建条目
        </el-button>
      </div>
    </div>

    <div class="toolbar">
      <el-select v-model="filterColor" placeholder="全部印色" clearable style="width: 150px">
        <el-option v-for="color in SPORE_COLORS" :key="color" :label="color" :value="color" />
      </el-select>
      <el-select v-model="filterAttachment" placeholder="全部着生方式" clearable style="width: 170px">
        <el-option v-for="item in GILL_ATTACHMENTS" :key="item" :label="item" :value="item" />
      </el-select>
      <el-input v-model="keyword" placeholder="编号 / 暂定名 / 树种 / 采集人" clearable style="width: 260px" />
      <el-tag type="info" effect="plain">命中 {{ visible.length }} / {{ recordState.records.length }} 条</el-tag>
      <el-button
        v-if="filterColor || filterAttachment || keyword"
        @click="(() => { filterColor = ''; filterAttachment = ''; keyword = '' })()"
      >
        清空条件
      </el-button>
    </div>

    <div class="card-grid">
      <el-card v-for="item in visible" :key="item.record.id" shadow="hover" class="atlas-card">
        <div class="card-top">
          <div>
            <div class="rec-name">{{ item.record.tempName || '未命名条目' }}</div>
            <div class="mono muted">{{ item.record.code }} · {{ pointName(item.record.pointId) }}</div>
          </div>
          <div class="tags">
            <GillAttachmentTag :attachment="item.record.attachment" />
            <SporePrintSwatch :color="item.spore?.color ?? null" :caption="item.spore ? `${item.spore.hours} h` : '未做印'" />
          </div>
        </div>
        <div class="cap-line">
          <el-tag size="small" effect="plain">{{ item.record.capShape }}</el-tag>
          <el-tag size="small" effect="plain">{{ item.record.capMargin }}</el-tag>
          <el-tag size="small" effect="plain">{{ item.record.capTexture }}</el-tag>
          <el-tag size="small" effect="plain">直径 {{ item.record.capDiameter }} cm</el-tag>
          <el-tag size="small" effect="plain">菌肉 {{ item.record.fleshReaction }}</el-tag>
        </div>
        <TraitsSummary :record="item.record" :spore="item.spore" :default-open="['gill']" class="traits" />
        <div class="stock-line">
          <el-tag type="success" size="small" effect="plain">在柜可用 {{ stockOf(item.record.id).available }} 份</el-tag>
          <el-tag
            :type="stockOf(item.record.id).lent > 0 ? 'warning' : 'info'"
            size="small"
            :effect="stockOf(item.record.id).lent > 0 ? 'dark' : 'plain'"
          >
            借出中 {{ stockOf(item.record.id).lent }} 份
          </el-tag>
          <el-button size="small" link @click="router.push(`/specimens?recordId=${item.record.id}`)">
            实物保管 ›
          </el-button>
        </div>
        <div class="ident-line">
          <template v-if="identifyOf(item.record.id)">
            <el-tag type="success" size="small" effect="dark">
              {{ identifyOf(item.record.id)?.conclusion }}
            </el-tag>
            <span class="muted">
              置信度 {{ identifyOf(item.record.id)?.confidence }}
              <template v-if="identifyOf(item.record.id)?.needReview"> · 待复核</template>
            </span>
          </template>
          <el-tag v-else type="warning" size="small" effect="plain">尚无鉴定结论</el-tag>
          <el-tag v-if="item.percent > 0" size="small" effect="plain">匹配度 {{ item.percent }}%</el-tag>
        </div>
        <div class="card-actions">
          <el-button size="small" @click="router.push(`/atlas/${item.record.id}`)">详情</el-button>
          <el-button
            size="small"
            :type="compareIds.includes(item.record.id) ? 'primary' : 'default'"
            @click="toggleCompare(item.record.id)"
          >
            {{ compareIds.includes(item.record.id) ? '已加入对比' : '加入对比' }}
          </el-button>
          <el-button size="small" type="danger" plain @click="removeRecord(item.record)">删除</el-button>
        </div>
      </el-card>
      <el-empty v-if="visible.length === 0" description="没有命中的条目，调整筛选条件或新建条目" />
    </div>

    <el-dialog v-model="dialogVisible" title="新建菌物条目" width="720px">
      <el-form label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="采集编号" required>
              <el-input v-model="form.code" placeholder="如 BHS-2026-003" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="暂定名">
              <el-input v-model="form.tempName" placeholder="如 橙黄牛肝菌（暂定）" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="采集点" required>
          <el-select v-model="form.pointId" style="width: calc(50% - 6px)">
            <el-option v-for="point in pointState.points" :key="point.id" :label="point.name" :value="point.id" />
          </el-select>
        </el-form-item>
        <RecordTraitsForm :model="form.traits as FungusRecord" />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存条目</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head-actions {
  display: flex;
  gap: 8px;
}
.atlas-card {
  border-radius: 12px;
}
.card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.rec-name {
  font-size: 15px;
  font-weight: 600;
}
.tags {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-end;
}
.cap-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}
.traits {
  margin-bottom: 10px;
}
.stock-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.ident-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.card-actions {
  display: flex;
  gap: 8px;
}
</style>
