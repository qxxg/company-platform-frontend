<script setup>
import { onMounted, ref } from 'vue'
import { fetchCustomerPage } from '@/api/customer'

/**
 * 客户远程选择器。
 *
 * 客户数量多时不做全量加载：输入关键字后向后端分页查询，最多展示 20 条。
 * 数据范围由后端按当前用户控制，销售只能选到自己的客户。
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '输入客户名称或编码搜索' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'change'])

const options = ref([])
const loading = ref(false)

async function search(keyword) {
  loading.value = true
  try {
    const data = await fetchCustomerPage({ page: 1, size: 20, keyword: keyword?.trim() || undefined })
    options.value = (data.records || []).map((item) => ({
      ...item,
      id: String(item.id),
    }))
  } catch {
    options.value = []
  } finally {
    loading.value = false
  }
}

function handleChange(value) {
  emit('update:modelValue', value ?? '')
  const matched = options.value.find((item) => item.id === String(value))
  emit('change', matched ?? null)
}

onMounted(() => search(''))
</script>

<template>
  <el-select
    :model-value="props.modelValue"
    :placeholder="props.placeholder"
    :disabled="props.disabled"
    :clearable="props.clearable"
    :loading="loading"
    filterable
    remote
    reserve-keyword
    :remote-method="search"
    style="width: 100%"
    @change="handleChange"
  >
    <el-option
      v-for="customer in options"
      :key="customer.id"
      :label="`${customer.name}（${customer.customerCode}）`"
      :value="customer.id"
    >
      <span>{{ customer.name }}</span>
      <span class="select-option-meta">{{ customer.customerCode }}</span>
    </el-option>
  </el-select>
</template>
