<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

/**
 * ECharts 容器。
 *
 * 只负责实例生命周期和自适应，不在这里拼业务 option。看板页每次刷新重新生成
 * option，组件用 notMerge=true 覆盖旧数据，避免状态残留。
 */
const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '260px' },
  empty: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无数据' },
})

const el = ref(null)
let chart = null
let observer = null

function render() {
  if (!chart || !props.option) return
  chart.setOption(props.option, true)
}

onMounted(async () => {
  await nextTick()
  if (!el.value) return
  chart = echarts.init(el.value, null, { renderer: 'canvas' })
  render()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart?.resize())
    observer.observe(el.value)
  }
})

watch(() => props.option, render, { deep: true })

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})

defineExpose({ resize: () => chart?.resize() })
</script>

<template>
  <div class="chart-panel" :style="{ height }">
    <div ref="el" class="chart-panel__canvas" />
    <div v-if="empty" class="chart-panel__empty">
      <el-icon :size="22"><slot name="empty-icon" /></el-icon>
      <span>{{ emptyText }}</span>
    </div>
  </div>
</template>

<style scoped>
.chart-panel {
  position: relative;
  width: 100%;
  min-height: 120px;
}

.chart-panel__canvas {
  width: 100%;
  height: 100%;
}

.chart-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
  background: color-mix(in srgb, var(--el-bg-color) 78%, transparent);
  border-radius: 12px;
}
</style>
