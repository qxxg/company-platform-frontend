<script setup>
import { computed } from 'vue'
import { ORDER_STATUS } from '@/constants'

const props = defineProps({
  status: { type: String, default: '' },
  size: { type: String, default: 'default' },
})

const meta = computed(() => ORDER_STATUS[props.status] || {
  label: props.status || '未知',
  type: 'info',
  description: '未识别的订单状态',
})
</script>

<template>
  <el-tooltip :content="meta.description" placement="top" :show-after="400">
    <el-tag class="status-tag" :type="meta.type" :size="size" effect="light" round>
      <span class="status-tag__dot"></span>{{ meta.label }}
    </el-tag>
  </el-tooltip>
</template>
