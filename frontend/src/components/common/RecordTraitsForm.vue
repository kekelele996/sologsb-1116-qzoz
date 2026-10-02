<script setup lang="ts">
import type { FungusRecord, GillAttachment } from '@/types'
import {
  CAP_MARGINS,
  CAP_SHAPES,
  CAP_TEXTURES,
  FLESH_REACTIONS,
  GILL_ATTACHMENTS,
  GILL_DENSITIES,
  RING_TYPES,
  VOLVA_TYPES
} from '@/types'

/**
 * 采集人侧形态表单：直接就地改写入参条目草稿。
 * 只覆盖形态 / 孢子印相关口径与采集描述，不含柜位、借出等保管字段。
 */
const props = defineProps<{
  model: FungusRecord
}>()

function patch(next: Partial<FungusRecord>): void {
  Object.assign(props.model, next)
}
</script>

<template>
  <div class="traits-form">
    <el-divider content-position="left">子实体 / 菌盖</el-divider>
    <el-row :gutter="12">
      <el-col :span="6">
        <el-form-item label="子实体数量">
          <el-input-number
            :model-value="model.fruitBodyCount"
            :min="1"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => patch({ fruitBodyCount: Number(v) || 1 })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="直径(cm)">
          <el-input-number
            :model-value="model.capDiameter"
            :min="0"
            :step="0.5"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => patch({ capDiameter: Number(v) || 0 })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="形状">
          <el-select
            :model-value="model.capShape"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['capShape']) => patch({ capShape: v })"
          >
            <el-option v-for="item in CAP_SHAPES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="边缘">
          <el-select
            :model-value="model.capMargin"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['capMargin']) => patch({ capMargin: v })"
          >
            <el-option v-for="item in CAP_MARGINS" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
    </el-row>
    <el-row :gutter="12">
      <el-col :span="6">
        <el-form-item label="表面质地">
          <el-select
            :model-value="model.capTexture"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['capTexture']) => patch({ capTexture: v })"
          >
            <el-option v-for="item in CAP_TEXTURES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
    </el-row>

    <el-divider content-position="left">菌肉 / 菌褶菌管</el-divider>
    <el-row :gutter="12">
      <el-col :span="6">
        <el-form-item label="菌肉厚(cm)">
          <el-input-number
            :model-value="model.fleshThickness"
            :min="0"
            :step="0.1"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => patch({ fleshThickness: Number(v) || 0 })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="变色反应">
          <el-select
            :model-value="model.fleshReaction"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['fleshReaction']) => patch({ fleshReaction: v })"
          >
            <el-option v-for="item in FLESH_REACTIONS" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="着生方式">
          <el-select
            :model-value="model.attachment"
            style="width: 100%"
            @update:model-value="(v: GillAttachment) => patch({ attachment: v })"
          >
            <el-option v-for="item in GILL_ATTACHMENTS" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="菌褶密度">
          <el-select
            :model-value="model.gillDensity"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['gillDensity']) => patch({ gillDensity: v })"
          >
            <el-option v-for="item in GILL_DENSITIES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
    </el-row>

    <el-divider content-position="left">菌柄 / 菌环菌托</el-divider>
    <el-row :gutter="12">
      <el-col :span="6">
        <el-form-item label="柄长(cm)">
          <el-input-number
            :model-value="model.stipeLength"
            :min="0"
            :step="0.5"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => patch({ stipeLength: Number(v) || 0 })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="柄径(cm)">
          <el-input-number
            :model-value="model.stipeDiameter"
            :min="0"
            :step="0.1"
            :controls="false"
            style="width: 100%"
            @update:model-value="(v: number | undefined) => patch({ stipeDiameter: Number(v) || 0 })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="菌环">
          <el-select
            :model-value="model.ring"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['ring']) => patch({ ring: v })"
          >
            <el-option v-for="item in RING_TYPES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
      <el-col :span="6">
        <el-form-item label="菌托">
          <el-select
            :model-value="model.volva"
            style="width: 100%"
            @update:model-value="(v: FungusRecord['volva']) => patch({ volva: v })"
          >
            <el-option v-for="item in VOLVA_TYPES" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-col>
    </el-row>

    <el-divider content-position="left">气味与生境</el-divider>
    <el-row :gutter="12">
      <el-col :span="8">
        <el-form-item label="气味">
          <el-input :model-value="model.odor" placeholder="如 淡淡坚果味" @update:model-value="(v: string) => patch({ odor: v })" />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="关联树种">
          <el-input
            :model-value="model.hostTree"
            placeholder="如 辽东栎"
            @update:model-value="(v: string) => patch({ hostTree: v })"
          />
        </el-form-item>
      </el-col>
      <el-col :span="8">
        <el-form-item label="采集人">
          <el-input
            :model-value="model.collector"
            @update:model-value="(v: string) => patch({ collector: v })"
          />
        </el-form-item>
      </el-col>
    </el-row>
    <el-form-item label="采集日期">
      <el-date-picker
        :model-value="model.collectDate"
        type="date"
        value-format="YYYY-MM-DD"
        style="width: 220px"
        @update:model-value="(v: string) => patch({ collectDate: v })"
      />
    </el-form-item>
    <el-form-item label="备注">
      <el-input
        :model-value="model.note"
        type="textarea"
        :rows="2"
        placeholder="仅作形态记录，不可作为食用依据"
        @update:model-value="(v: string) => patch({ note: v })"
      />
    </el-form-item>
  </div>
</template>
