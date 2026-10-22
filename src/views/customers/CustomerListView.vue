<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Search, View } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchCustomerPage } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney } from '@/utils/money'
import {
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_OPTIONS,
  customerStatusLabel,
  sourceLabel,
} from '@/constants'

const router = useRouter()
const auth = useAuthStore()

const filters = reactive({
  keyword: '',
  status: '',
  page: 1,
  size: 10,
})

const loading = ref(false)
const loadError = ref('')
const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })

const canWrite = computed(() => auth.hasPermission('customer:write'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.status))

function statusTagType(status) {
  return CUSTOMER_STATUS[status]?.type || 'info'
}

function ownerLabel(row) {
  return row.ownerName || `用户 #${row.ownerUserId ?? '—'}`
}

function creditLabel(row) {
  if (!row.creditLimit || Number(row.creditLimit) <= 0) return '未授信'
  return formatMoney(row.creditLimit, row.currency)
}

async function loadCustomers() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    const data = await fetchCustomerPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { records: [], total: 0, pageNumber: 1, pageSize: filters.size }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadCustomers()
}

function handleReset() {
  filters.keyword = ''
  filters.status = ''
  filters.page = 1
  loadCustomers()
}

function handleSizeChange(size) {
  filters.size = size
  filters.page = 1
  loadCustomers()
}

function handlePageChange(page) {
  filters.page = page
  loadCustomers()
}

function openDetail(row) {
  router.push({ name: 'customer-detail', params: { id: row.id } })
}

onMounted(loadCustomers)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="CUSTOMER MANAGEMENT"
      title="客户列表"
      description="客户来源和归属业务员必填；销售只能看到自己的客户，管理员与财务可查看全部。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadCustomers">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="router.push('/customers/create')">
          <el-icon><Plus /></el-icon>新建客户
        </el-button>
      </template>
    </PageHeader>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="客户名称、编码、手机号或信用代码"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="客户状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in CUSTOMER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button :disabled="!hasFilters" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>客户名称、来源、归属业务员和信用额度是订单提交前的关键主数据。</span>
        <span>信用额度为 0 表示未授信，订单服务会阻断赊销下单。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">CUSTOMER RECORDS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 个客户</h2>
        </div>
        <span class="table-panel__meta">第 {{ pageData.pageNumber }} 页 · 每页 {{ pageData.pageSize }} 条</span>
      </div>

      <el-table
        v-loading="loading"
        :data="pageData.records"
        class="data-table"
        row-key="id"
        @row-click="openDetail"
      >
        <el-table-column label="客户编码" min-width="120">
          <template #default="{ row }">
            <span class="mono-text">{{ row.customerCode }}</span>
          </template>
        </el-table-column>
        <el-table-column label="客户名称" min-width="220">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.name }}</div>
            <div class="cell-secondary">{{ row.shortName || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" min-width="120">
          <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
        </el-table-column>
        <el-table-column label="归属业务员" min-width="140">
          <template #default="{ row }">{{ ownerLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="联系人" min-width="140">
          <template #default="{ row }">
            <div>{{ row.contactName || '—' }}</div>
            <div class="cell-secondary">{{ row.contactPhone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="信用额度" min-width="140" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-muted': !row.creditLimit || Number(row.creditLimit) <= 0 }">
              {{ creditLabel(row) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ customerStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click.stop="openDetail(row)">
              <el-icon><View /></el-icon>查看
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="暂无客户数据"
            description="请调整筛选条件，或先录入客户、业务员归属和财务合同。"
          />
        </template>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          background
          layout="sizes, prev, pager, next, total"
          :total="pageData.total"
          :current-page="pageData.pageNumber"
          :page-size="pageData.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </section>
  </div>
</template>
