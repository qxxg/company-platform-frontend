<script setup>
import { computed } from 'vue'
import { Box, Document, Search, Warning } from '@element-plus/icons-vue'

const props = defineProps({
  title: { type: String, default: '暂无数据' },
  description: { type: String, default: '' },
  icon: { type: String, default: 'Box' },
})

const icons = { Box, Document, Search, Warning }
const resolvedIcon = computed(() => icons[props.icon] || Box)
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__icon">
      <el-icon :size="28"><component :is="resolvedIcon" /></el-icon>
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-state__action">
      <slot />
    </div>
  </div>
</template>
