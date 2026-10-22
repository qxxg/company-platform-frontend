<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CircleCheck,
  Refresh,
  Search,
  TrendCharts,
  Wallet,
  WarningFilled,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchCustomerCredit, fetchCustomerPage } from '@/api/customer'
import { fetchCreditOccupancy } from '@/api/order'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney } from '@/utils/money'
import { CUSTOMER_STATUS, CUSTOMER_STATUS_OPTIONS, customerStatusLabel } from '@/constants'

/**
 * 财务信用看板。
 *
 * 已用额度 = 未收应收 + 未关闭订单金额。应收由客户服务提供，订单占用由
 * 订单服务按分片汇总；页面只做加总展示，不修改额度。额度调整需要走审批，
 * 审批中心落地前不允许在此页直接改数。
 */
const router = useRouter()
const auth = useAuthStore()

const filters = reactive({ keyword: '', status: '', page: 1, size: 10 })
const rows = ref([])
const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const loading = ref(false)
const loadError = ref('')

const canReadContracts = computed(() => auth.hasPermission('finance:contract:read'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.status))

const summary = computed(() => {
  const result = {
    limit: 0,
    used: 0,
    available: 0,
    riskCount: 0,
    incompleteCount: 0,
    customerCount: rows.value.length,
  }
  for (const row of rows.value) {
    if (row.creditLimit !== null) result.limit += row.creditLimit
    if (row.used !== null) result.used += row.used
    if (row.available !== null) result.available += row.available
    if (row.risk) result.riskCount += 1
    if (row.used === null) result.incompleteCount += 1
  }
  return result
})

function statusTagType(status) {
  return CUSTOMER_STATUS[status]?.type || 'info'
}

function ownerLabel(row) {
  return row.ownerName || `用户 #${row.ownerUserId ?? '—'}`
}

function amount(value, currency = 'CNY') {
  return value === null || value === undefined ? '—' : formatMoney(value, currency)
}

function usedPercent(row) {
  if (row.used === null || !row.creditLimit || row.creditLimit <= 0) return 0
  return Math.min(100, Math.round((row.used * 100) / row.creditLimit))
}

function progressStatus(row) {
  if (row.overLimit) return 'exception'
  if (usedPercent(row) >= 80) return 'warning'
  return 'success'
}

function riskTags(row) {
  const tags = []
  if (row.creditLimit !== null && row.creditLimit <= 0) tags.push({ label: '未授信', type: 'info' })
  if (row.overdueDays > 30) tags.push({ label: '逾期停单', type: 'danger' })
  else if (row.overdueDays > 0) tags.push({ label: `逾期 ${row.overdueDays} 天`, type: 'warning' })
  if (row.overLimit) tags.push({ label: '超出额度', type: 'danger' })
  if (row.status === 'BLACKLIST') tags.push({ label: '黑名单', type: 'danger' })
  if (!tags.length) tags.push({ label: '正常', type: 'success' })
  return tags
}

/**
 * 客户列表 + 每个客户的应收/订单占用。
 *
 * 当前页最多 100 条，逐客户并发查询可以避免后端新增跨服务聚合接口；
 * 数据量增大后应改为批量接口或离线汇总。任一明细失败时该行标记为不完整，
 * 不用 0 代替，避免低估已用额度。
 */
async function loadRows() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    const data = await fetchCustomerPage(params)
    const records = data.records || []
    const enriched = await Promise.all(
      records.map(async (customer) => {
        const [creditResult, occupancyResult] = await Promise.allSettled([
          fetchCustomerCredit(customer.id),
          fetchCreditOccupancy(customer.id),
        ])
        const credit = creditResult.status === 'fulfilled' ? creditResult.value : null
        const occupancy = occupancyResult.status === 'fulfilled' ? occupancyResult.value : null
        const creditLimit =
          credit?.creditLimit !== undefined && credit?.creditLimit !== null
            ? Number(credit.creditLimit)
            : customer.creditLimit !== undefined && customer.creditLimit !== null
              ? Number(customer.creditLimit)
              : null
        const receivable =
          credit?.uncollectedReceivable !== undefined && credit?.uncollectedReceivable !== null
            ? Number(credit.uncollectedReceivable)
            : null
        const orderAmount =
          occupancy?.openOrderAmount !== undefined && occupancy?.openOrderAmount !== null
            ? Number(occupancy.openOrderAmount)
            : null
        const overdueDays = Number(credit?.maxOverdueDays ?? 0)
        const used = receivable !== null && orderAmount !== null ? receivable + orderAmount : null
        const available =
          used !== null && creditLimit !== null ? Math.max(0, creditLimit - used) : null
        const overLimit = used !== null && creditLimit !== null && creditLimit > 0 && used > creditLimit
        const risk = (used !== null && creditLimit !== null && creditLimit <= 0) ||
          overLimit ||
          overdueDays > 30 ||
          customer.status === 'BLACKLIST'
        return {
          ...customer,
          creditLimit,
          receivable,
          orderAmount,
          orderCount: Number(occupancy?.openOrderCount ?? 0),
          overdueDays,
          used,
          available,
          overLimit,
          risk,
          detailIncomplete: creditResult.status !== 'fulfilled' || occupancyResult.status !== 'fulfilled',
        }
      }),
    )
    rows.value = enriched
    pageData.value = {
      records: enriched,
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    rows.value = []
    pageData.value = { records: [], total: 0, pageNumber: 1, pageSize: filters.size }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadRows()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.page = 1
  loadRows()
}

function handleSizeChange(size) {
  filters.size = size
  filters.page = 1
  loadRows()
}

function handlePageChange(page) {
  filters.page = page
  loadRows()
}

function openCustomer(row) {
  router.push({ name: 'customer-detail', params: { id: row.id } })
}

onMounted(loadRows)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · CREDIT"
      title="信用看板"
      description="已用额度 = 未收应收 + 已确认未发货订单；逾期超过 30 天或超出额度会阻断下单。"
    >
      <template #actions>
        <el-button v-if="canReadContracts" @click="router.push('/finance/contracts')">
          <el-icon><Wallet /></el-icon>合同管理
        </el-button>
        <el-button :loading="loading" @click="loadRows">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="额度口径与调整">
      <template #default>
        应收数据来自客户服务，订单占用来自订单服务。信用额度调整、临时额度和黑名单恢复必须走审批，
        当前页面只读；审批中心上线前请由财务与管理员线下确认后再调整数据。
      </template>
    </el-alert>

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
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>额度为 0 表示未授信，订单服务会阻断赊销下单。</span>
        <span>客户编号不是订单分片键，订单占用查询会广播到全部分片。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />
    <el-alert
      v-else-if="summary.incompleteCount > 0"
      type="warning"
      :closable="false"
      show-icon
      class="section-alert"
      :title="`当前页有 ${summary.incompleteCount} 个客户的应收或订单占用未加载完整，相关金额以“—”显示。`"
    />

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon">
          <el-icon><Wallet /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">当前页授信总额</span>
          <strong class="metric-card__value">{{ amount(summary.limit) }}</strong>
          <span class="metric-card__hint">{{ summary.customerCount }} 个客户 · 仅统计当前页</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber">
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">当前页已用额度</span>
          <strong class="metric-card__value">{{ amount(summary.used) }}</strong>
          <span class="metric-card__hint">未收应收 + 未关闭订单</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">当前页可用额度</span>
          <strong class="metric-card__value">{{ amount(summary.available) }}</strong>
          <span class="metric-card__hint">不足时订单服务会阻断提交</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--red">
          <el-icon><WarningFilled /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">风险客户</span>
          <strong class="metric-card__value">{{ summary.riskCount }}</strong>
          <span class="metric-card__hint">未授信、超额、逾期超 30 天或黑名单</span>
        </div>
      </div>
    </section>

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">CREDIT EXPOSURE</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 个客户</h2>
        </div>
        <span class="table-panel__meta">第 {{ pageData.pageNumber }} 页 · 每页 {{ pageData.pageSize }} 条</span>
      </div>

      <el-table v-loading="loading" :data="rows" class="data-table" row-key="id" @row-click="openCustomer">
        <el-table-column label="客户" min-width="230">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.name }}</div>
            <div class="cell-secondary">{{ row.customerCode }} · {{ ownerLabel(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ customerStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="信用额度" min-width="135" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-muted': row.creditLimit === null || row.creditLimit <= 0 }">
              {{ amount(row.creditLimit, row.currency) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="未收应收" min-width="130" align="right">
          <template #default="{ row }">{{ amount(row.receivable, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="订单占用" min-width="155" align="right">
          <template #default="{ row }">
            <div>{{ amount(row.orderAmount, row.currency) }}</div>
            <div class="cell-secondary">{{ row.orderCount }} 笔未关闭订单</div>
          </template>
        </el-table-column>
        <el-table-column label="已用 / 可用" min-width="200">
          <template #default="{ row }">
            <div v-if="row.used !== null">
              <div class="credit-usage__numbers">
                <strong>{{ amount(row.used, row.currency) }}</strong>
                <span> / {{ amount(row.creditLimit, row.currency) }}</span>
              </div>
              <el-progress
                class="credit-progress"
                :percentage="usedPercent(row)"
                :status="progressStatus(row)"
                :stroke-width="6"
                :show-text="false"
              />
              <div class="cell-secondary">
                {{ usedPercent(row) }}% 已用 · 可用 {{ amount(row.available, row.currency) }}
              </div>
            </div>
            <span v-else class="text-muted">明细加载失败，请刷新</span>
          </template>
        </el-table-column>
        <el-table-column label="最大逾期" width="105" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.overdueDays > 30" type="danger" effect="light">{{ row.overdueDays }} 天</el-tag>
            <el-tag v-else-if="row.overdueDays > 0" type="warning" effect="light">{{ row.overdueDays }} 天</el-tag>
            <span v-else class="text-muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="风险提示" min-width="150">
          <template #default="{ row }">
            <div class="risk-tags">
              <el-tag
                v-for="tag in riskTags(row)"
                :key="tag.label"
                :type="tag.type"
                effect="light"
                size="small"
              >
                {{ tag.label }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无信用数据" description="请调整筛选条件，或先在客户管理维护客户和授信额度。" />
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
