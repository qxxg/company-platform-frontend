<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CopyDocument, Plus, Refresh, Search, View } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import OrderStatusTag from '@/components/OrderStatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchOrderPage } from '@/api/order'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { ORDER_STATUS_OPTIONS } from '@/constants'

const router = useRouter()
const auth = useAuthStore()

const filters = reactive({
  orderNo: '',
  customerId: '',
  factoryId: '',
  orderStatus: '',
  page: 1,
  size: 10,
})

const loading = ref(false)
const loadError = ref('')
const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const factories = ref([])
const lastLoadedAt = ref('')

const canCreate = computed(() => auth.hasPermission('order:create'))
const canListFactories = computed(() => auth.hasPermission('system:factory:list'))
const hasFilters = computed(() => Boolean(filters.orderNo || filters.customerId || filters.factoryId || filters.orderStatus))

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || `工厂 #${factoryId ?? '—'}`
}

async function loadFactories() {
  if (!canListFactories.value) return
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    // 工厂列表仅用于筛选和名称展示，失败不阻塞订单查询。
    factories.value = []
  }
}

async function loadOrders() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.orderNo.trim()) params.orderNo = filters.orderNo.trim()
    if (filters.customerId.trim()) params.customerId = filters.customerId.trim()
    if (filters.factoryId) params.factoryId = filters.factoryId
    if (filters.orderStatus) params.orderStatus = filters.orderStatus

    const data = await fetchOrderPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
    lastLoadedAt.value = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { records: [], total: 0, pageNumber: 1, pageSize: filters.size }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadOrders()
}

function handleReset() {
  filters.orderNo = ''
  filters.customerId = ''
  filters.factoryId = ''
  filters.orderStatus = ''
  filters.page = 1
  loadOrders()
}

function handleSizeChange(size) {
  filters.size = size
  filters.page = 1
  loadOrders()
}

function handlePageChange(page) {
  filters.page = page
  loadOrders()
}

function openDetail(row) {
  router.push({ name: 'order-detail', params: { orderNo: row.orderNo } })
}

async function copyOrderNo(orderNo) {
  try {
    await navigator.clipboard.writeText(String(orderNo))
    ElMessage.success('订单号已复制')
  } catch {
    ElMessage.warning('浏览器不允许访问剪贴板，请手动复制')
  }
}

onMounted(async () => {
  await loadFactories()
  await loadOrders()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="ORDER MANAGEMENT"
      title="订单列表"
      description="订单号精确路由到分片，客户、工厂和状态条件会广播到 8 张物理表后合并。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadOrders">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canCreate" type="primary" @click="router.push('/orders/create')">
          <el-icon><Plus /></el-icon>新建订单
        </el-button>
      </template>
    </PageHeader>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="订单号">
          <el-input v-model="filters.orderNo" placeholder="完整订单号，精确匹配" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="客户编号">
          <el-input v-model="filters.customerId" placeholder="如 3001" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item v-if="canListFactories" label="生产工厂">
          <el-select v-model="filters.factoryId" placeholder="全部工厂" clearable>
            <el-option
              v-for="factory in factories"
              :key="factory.id"
              :label="`${factory.name}（${factory.code}）`"
              :value="String(factory.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="filters.orderStatus" placeholder="全部状态" clearable>
            <el-option v-for="item in ORDER_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <span>订单号支持精确查询；不填条件时按创建时间倒序展示全部订单。</span>
        <span v-if="lastLoadedAt">最近刷新：{{ lastLoadedAt }}</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">ORDER RECORDS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 笔订单</h2>
        </div>
        <span class="table-panel__meta">第 {{ pageData.pageNumber }} 页 · 每页 {{ pageData.pageSize }} 条</span>
      </div>

      <el-table
        v-loading="loading"
        :data="pageData.records"
        class="data-table"
        row-key="orderNo"
        @row-click="openDetail"
      >
        <el-table-column label="订单号" min-width="230">
          <template #default="{ row }">
            <div class="order-no-cell">
              <span class="mono-text">{{ row.orderNo }}</span>
              <el-button text circle size="small" aria-label="复制订单号" @click.stop="copyOrderNo(row.orderNo)">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="客户编号" width="110">
          <template #default="{ row }">#{{ row.customerId }}</template>
        </el-table-column>
        <el-table-column label="合同 ID" width="110">
          <template #default="{ row }">
            <span :class="{ 'text-muted': !row.contractId }">#{{ row.contractId || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="生产工厂" min-width="140">
          <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
        </el-table-column>
        <el-table-column label="订单金额" width="150" align="right">
          <template #default="{ row }">
            <span class="amount-text">{{ formatMoney(row.totalAmount, row.currency) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><OrderStatusTag :status="row.orderStatus" size="small" /></template>
        </el-table-column>
        <el-table-column label="创建人" width="100">
          <template #default="{ row }">#{{ row.createdBy }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click.stop="openDetail(row)">
              <el-icon><View /></el-icon>详情
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="没有匹配的订单"
            description="尝试调整筛选条件，或创建一笔新订单。"
            icon="Search"
          >
            <el-button v-if="canCreate" type="primary" @click="router.push('/orders/create')">新建订单</el-button>
          </EmptyState>
        </template>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          :current-page="filters.page"
          :page-size="filters.size"
          :page-sizes="[10, 20, 50]"
          :total="pageData.total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>
  </div>
</template>
