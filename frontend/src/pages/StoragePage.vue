<script setup lang="ts">
import { ref } from 'vue'
import SpecimenCopies from '@/components/common/SpecimenCopies.vue'

const keyword = ref('')
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2 class="page-title">标本保管</h2>
        <p class="page-sub">
          保管只管实物份：柜位、借出、归还与报废。每份实物独立留痕，不影响采集人侧的形态与鉴定记录。
        </p>
      </div>
    </div>

    <el-card shadow="never" class="block">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="按编号 / 暂定名 / 柜位号筛选"
          clearable
          style="width: 280px"
        />
      </div>
      <SpecimenCopies :keyword="keyword" />
    </el-card>
  </div>
</template>

<style scoped>
.block {
  border-radius: 12px;
}
.toolbar {
  margin-bottom: 12px;
}
</style>
