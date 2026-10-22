<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowRight,
  Clock,
  Coin,
  CreditCard,
  Cpu,
  DataAnalysis,
  FullScreen,
  Key,
  Lock,
  Money,
  OfficeBuilding,
  Plus,
  Refresh,
  Tickets,
  TrendCharts,
  User,
  UserFilled,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import StatCard from '@/components/StatCard.vue'
import ChartPanel from '@/components/ChartPanel.vue'
import OrderStatusTag from '@/components/OrderStatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAuthStore } from '@/stores/auth'
import { fetchOrderPage } from '@/api/order'
import { fetchFactories, fetchUsers } from '@/api/system'
import { fetchBiDashboard, fetchBiMetrics } from '@/api/bi'
import { formatDateTime, initialsOf } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { ROADMAP_MODULES, ROLE_LABELS } from '@/constants'

const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const orderTotal = ref(0)
const pendingTotal = ref(0)
const factories = ref([])
const users = ref([])
const recentOrders = ref([])
const bi = ref(null)
const biError = ref('')
const metricsVisible = ref(false)
const metricsLoading = ref(false)
const metrics = ref([])

const canReadOrders = computed(() => auth.hasPermission('order:read'))
const canCreateOrder = computed(() => auth.hasPermission('order:create'))
const canListUsers = computed(() => auth.hasPermission('system:user:list'))
const canListFactories = computed(() => auth.hasPermission('system:factory:list'))
const canViewBi = computed(() => auth.hasPermission('bi:dashboard:read'))
const canViewCockpit = computed(() => auth.hasPermission('bi:cockpit:read'))
const biCards = computed(() => (bi.value?.cards || []).slice(0, 8))
const biAlerts = computed(() => (bi.value?.alerts || []).slice(0, 5))
const pendingMetrics = computed(() => bi.value?.pendingMetrics || [])
const dataStatusText = computed(() => {
  const status = bi.value?.meta?.dataStatus
  if (status === 'NO_DATA') return '等待首次同步'
  if (status === 'STALE') return '数据延迟'
  return '数据就绪'
})
const dataStatusTone = computed(() => {
  const status = bi.value?.meta?.dataStatus
  if (status === 'NO_DATA') return 'info'
  if (status === 'STALE') return 'warning'
  return 'success'
})
const scopeLabel = computed(() => bi.value?.meta?.scopeLabel || '当前数据范围')
const noMetricPermission = computed(() => Boolean(bi.value) && !biCards.value.length
  && bi.value?.meta?.dataStatus === 'READY')
const trendOption = computed(() => {
  const trend = bi.value?.orderTrend
  const months = (trend?.months || []).map((month) => `${Number(month.slice(5))}月`)
  const orderAmounts = (trend?.orderAmounts || []).map((value) => Number(value))
  const receiptAmounts = (trend?.receiptAmounts || []).map((value) => Number(value))
  return {
    color: ['#0f8a78', '#3b82f6'],
    grid: { left: 10, right: 14, top: 38, bottom: 22, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatMoney(Math.round(Number(value))),
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: months,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eef2f7' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 11,
        formatter: (value) => compactMoney(value),
      },
    },
    series: [
      {
        name: '订单额',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: orderAmounts,
        areaStyle: { opacity: 0.08 },
        lineStyle: { width: 2 },
      },
      {
        name: '收款',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        data: receiptAmounts,
        lineStyle: { width: 1.5, type: 'dashed' },
      },
    ],
  }
})
const orderStatusOption = computed(() => {
  const data = (bi.value?.orderStatus || []).map((item) => ({
    name: item.label,
    value: Number(item.count || 0),
  }))
  return {
    color: ['#0f8a78', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e'],
    tooltip: { trigger: 'item', formatter: '{b}: {c} 笔 ({d}%)' },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 9,
      itemHeight: 9,
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '70%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data,
      },
    ],
  }
})
const cardIcons = {
  month_order_amount: Tickets,
  month_order_count: TrendCharts,
  month_receipt_amount: Wallet,
  receivable_balance: Money,
  overdue_receivable: Warning,
  credit_over_limit_customers: CreditCard,
  open_order_count: Clock,
  order_completion_rate: DataAnalysis,
  pending_approval_count: Coin,
  average_approval_hours: Clock,
  equipment_fault_count: Cpu,
  equipment_queue_wait: Clock,
  inventory_amount: OfficeBuilding,
  inventory_shortage_count: Warning,
  expense_pending_amount: Money,
  loan_outstanding: CreditCard,
}

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const primaryRole = computed(() => ROLE_LABELS[auth.roles[0]] || auth.roles[0] || '普通用户')

const factoryName = (factoryId) => {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || `工厂 #${factoryId ?? '—'}`
}

const roadmapPreview = [ROADMAP_MODULES.finance, ROADMAP_MODULES.equipment, ROADMAP_MODULES.warehouse,
  ROADMAP_MODULES.reports]

function compactMoney(cents) {
  const yuan = Number(cents) / 100
  if (!Number.isFinite(yuan)) return '0'
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(1)}万`
  if (Math.abs(yuan) >= 1000) return `${(yuan / 1000).toFixed(0)}千`
  return String(Math.round(yuan))
}

function cardIcon(code) {
  return cardIcons[code] || DataAnalysis
}

function showUnit(card) {
  if (!card?.unit) return false
  return !String(card.display || '').includes('¥')
    && !String(card.display || '').includes('万')
    && !String(card.display || '').includes('%')
}

function severityClass(severity) {
  return `risk-row--${String(severity || 'low').toLowerCase()}`
}

function metricTagType(status) {
  return status === 'READY' ? 'success' : 'info'
}

function metricStatusText(status) {
  return status === 'READY' ? '可计算' : '待数据源'
}

function openCard(card) {
  if (card?.link) router.push(card.link)
}

async function openMetrics() {
  metricsVisible.value = true
  if (metrics.value.length) return
  metricsLoading.value = true
  try {
    metrics.value = await fetchBiMetrics()
  } catch (error) {
    ElMessage.error(error?.message || '指标口径加载失败')
  } finally {
    metricsLoading.value = false
  }
}

async function loadDashboard({ silent = false } = {}) {
  if (!silent) loading.value = true
  refreshing.value = true
  loadError.value = ''
  const tasks = []

  if (canReadOrders.value) {
    tasks.push(
      fetchOrderPage({ page: 1, size: 6 }).then((data) => {
        recentOrders.value = data.records || []
        orderTotal.value = Number(data.total || 0)
      }),
      fetchOrderPage({ page: 1, size: 1, orderStatus: 'CREATED' }).then((data) => {
        pendingTotal.value = Number(data.total || 0)
      }),
    )
  }
  if (canListFactories.value) {
    tasks.push(fetchFactories().then((data) => { factories.value = data || [] }))
  }
  if (canListUsers.value) {
    tasks.push(fetchUsers().then((data) => { users.value = data || [] }))
  }
  if (canViewBi.value) {
    tasks.push(
      fetchBiDashboard()
        .then((data) => {
          bi.value = data
          biError.value = ''
        })
        .catch((error) => {
          biError.value = error?.message || '经营指标加载失败'
        }),
    )
  } else {
    bi.value = null
  }

  const results = await Promise.allSettled(tasks)
  const rejected = results.find((item) => item.status === 'rejected')
  if (rejected) loadError.value = rejected.reason?.message || '部分数据加载失败，请稍后刷新'

  loading.value = false
  refreshing.value = false
}

function openOrder(orderNo) {
  router.push({ name: 'order-detail', params: { orderNo } })
}

onMounted(() => loadDashboard())
</script>

<template>
  <div class="dashboard-page">
    <section class="dashboard-hero">
      <div class="dashboard-hero__content">
        <div class="dashboard-hero__eyebrow">
          <span class="live-dot"></span>
          工作台 · {{ primaryRole }}
        </div>
        <h1>{{ greeting }}，{{ auth.displayName }}</h1>
        <p>
          今天也从一条清晰的业务链路开始：先确认订单，再安排生产，最后让每一笔交付有据可查。
        </p>
        <div class="dashboard-hero__actions">
          <el-button v-if="canCreateOrder" type="primary" size="large" @click="router.push('/orders/create')">
            <el-icon><Plus /></el-icon>新建订单
          </el-button>
          <el-button v-if="canReadOrders" size="large" @click="router.push('/orders')">
            <el-icon><Tickets /></el-icon>查看订单
          </el-button>
          <el-button v-if="canViewCockpit" size="large" @click="router.push('/cockpit')">
            <el-icon><FullScreen /></el-icon>经营大屏
          </el-button>
          <el-button text class="dashboard-refresh" :loading="refreshing" @click="loadDashboard({ silent: true })">
            <el-icon><Refresh /></el-icon>刷新数据
          </el-button>
        </div>
      </div>
      <div class="dashboard-hero__aside">
        <div class="hero-session">
          <div class="hero-session__top">
            <span>当前会话</span>
            <span class="status-pill status-pill--green">已认证</span>
          </div>
          <div class="hero-session__identity">
            <div class="hero-session__avatar">{{ initialsOf(auth.displayName) }}</div>
            <div>
              <strong>{{ auth.username }}</strong>
              <span>{{ auth.employeeNo || '员工编号未配置' }}</span>
            </div>
          </div>
          <div class="hero-session__permissions">
            <span>{{ auth.roles.length }} 个角色</span>
            <span>{{ auth.permissions.length }} 项权限</span>
          </div>
        </div>
      </div>
    </section>

    <el-alert
      v-if="loadError"
      type="warning"
      :title="loadError"
      :closable="false"
      show-icon
      class="section-alert"
    />

    <section v-if="canViewBi" class="bi-section">
      <div class="bi-meta">
        <div class="bi-meta__left">
          <span class="bi-meta__eyebrow">经营指标 · {{ scopeLabel }}</span>
          <span class="bi-meta__sync">更新于 {{ bi?.meta?.dataUpdatedAt || '—' }}</span>
        </div>
        <div class="bi-meta__actions">
          <el-tag :type="dataStatusTone" effect="plain" round size="small">{{ dataStatusText }}</el-tag>
          <el-button text size="small" @click="openMetrics">指标口径</el-button>
        </div>
      </div>

      <el-alert
        v-if="biError"
        type="info"
        :title="biError"
        :closable="false"
        show-icon
        class="section-alert"
      />

      <div v-if="biCards.length" class="bi-card-grid">
        <button
          v-for="card in biCards"
          :key="card.code"
          type="button"
          class="bi-card"
          :class="`bi-card--${card.tone || 'teal'}`"
          @click="openCard(card)"
        >
          <span class="bi-card__icon">
            <el-icon :size="18"><component :is="cardIcon(card.code)" /></el-icon>
          </span>
          <span class="bi-card__body">
            <small>{{ card.label }}</small>
            <strong>
              {{ card.display }}
              <em v-if="showUnit(card)">{{ card.unit }}</em>
            </strong>
            <span>{{ card.hint }}</span>
          </span>
        </button>
      </div>
      <el-alert
        v-else-if="noMetricPermission"
        type="info"
        title="当前账号缺少经营指标所需的业务查看权限，这里不会展示任何汇总数字。"
        :closable="false"
        show-icon
        class="section-alert"
      />
      <el-skeleton v-else-if="loading" :rows="2" animated />

      <div v-if="bi" class="bi-insight-grid">
        <article class="bi-panel bi-panel--trend">
          <div class="bi-panel__head">
            <div>
              <span class="panel__eyebrow">TREND</span>
              <h3>近 12 个月订单与收款</h3>
            </div>
            <span class="bi-panel__note">按分存储，图表按元展示</span>
          </div>
          <ChartPanel
            :option="trendOption"
            height="250px"
            :empty="!bi.orderTrend?.months?.length"
          />
        </article>

        <article class="bi-panel">
          <div class="bi-panel__head">
            <div>
              <span class="panel__eyebrow">ORDER STATUS</span>
              <h3>本月订单状态</h3>
            </div>
          </div>
          <ChartPanel
            :option="orderStatusOption"
            height="250px"
            :empty="!bi.orderStatus?.length"
            empty-text="本月暂无订单"
          />
        </article>
      </div>

      <article v-if="bi" class="bi-panel bi-risk-panel">
        <div class="bi-panel__head">
          <div>
            <span class="panel__eyebrow">RISK & TODO</span>
            <h3>风险与待办</h3>
          </div>
          <el-tag v-if="pendingMetrics.length" type="info" effect="plain" round size="small">
            {{ pendingMetrics.length }} 项待数据源
          </el-tag>
        </div>

        <div v-if="biAlerts.length" class="risk-list">
          <button
            v-for="alert in biAlerts"
            :key="alert.type"
            type="button"
            class="risk-row"
            :class="severityClass(alert.severity)"
            @click="alert.link && router.push(alert.link)"
          >
            <span class="risk-row__dot"></span>
            <span class="risk-row__body">
              <strong>{{ alert.title }}</strong>
              <small>{{ alert.detail }}</small>
            </span>
            <span v-if="Number(alert.count) > 0" class="risk-row__count">{{ alert.count }}</span>
            <el-icon v-if="alert.link"><ArrowRight /></el-icon>
          </button>
        </div>
        <div v-else class="bi-panel__empty bi-panel__empty--compact">
          <el-icon :size="24"><DataAnalysis /></el-icon>
          <strong>暂无需要立即处理的风险</strong>
          <span>看板每 5 分钟同步一次，异常会自动进入这里。</span>
        </div>

        <button v-if="pendingMetrics.length" type="button" class="pending-strip" @click="openMetrics">
          <span>
            未接入数据源：{{ pendingMetrics.slice(0, 3).map((item) => item.name).join('、') }}{{ pendingMetrics.length > 3 ? ' 等' : '' }}
          </span>
          <el-icon><ArrowRight /></el-icon>
        </button>
      </article>
    </section>

    <section v-if="!biCards.length" class="stat-grid">
      <StatCard
        label="订单总量"
        :value="canReadOrders ? orderTotal.toLocaleString('zh-CN') : '—'"
        suffix="笔"
        hint="全部分片物理表汇总"
        tone="teal"
        :loading="loading"
      >
        <template #icon><el-icon><Tickets /></el-icon></template>
      </StatCard>
      <StatCard
        label="待排产订单"
        :value="canReadOrders ? pendingTotal.toLocaleString('zh-CN') : '—'"
        suffix="笔"
        hint="已创建、等待合同与排产校验"
        tone="amber"
        :loading="loading"
      >
        <template #icon><el-icon><Clock /></el-icon></template>
      </StatCard>
      <StatCard
        label="工厂"
        :value="canListFactories ? factories.length : '—'"
        suffix="个"
        hint="组织树叶子节点"
        tone="blue"
        :loading="loading"
      >
        <template #icon><el-icon><OfficeBuilding /></el-icon></template>
      </StatCard>
      <StatCard
        label="员工账号"
        :value="canListUsers ? users.length : '—'"
        suffix="人"
        :hint="canListUsers ? '已接入统一账号体系' : '当前角色无查看权限'"
        tone="violet"
        :loading="loading"
      >
        <template #icon><el-icon><User /></el-icon></template>
      </StatCard>
    </section>

    <section class="dashboard-grid">
      <article class="panel panel--orders">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">RECENT ORDERS</span>
            <h2>最近订单</h2>
          </div>
          <el-button v-if="canReadOrders" text type="primary" @click="router.push('/orders')">
            全部订单<el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>

        <el-table
          v-if="canReadOrders"
          v-loading="loading"
          :data="recentOrders"
          class="dashboard-table"
          @row-click="(row) => openOrder(row.orderNo)"
        >
          <el-table-column label="订单号" min-width="190">
            <template #default="{ row }">
              <span class="mono-text">{{ row.orderNo }}</span>
            </template>
          </el-table-column>
          <el-table-column label="客户" width="110">
            <template #default="{ row }">#{{ row.customerId }}</template>
          </el-table-column>
          <el-table-column label="工厂" min-width="130">
            <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
          </el-table-column>
          <el-table-column label="金额" width="130" align="right">
            <template #default="{ row }">
              <span class="amount-text">{{ formatMoney(row.totalAmount, row.currency) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><OrderStatusTag :status="row.orderStatus" size="small" /></template>
          </el-table-column>
          <el-table-column label="创建时间" width="172">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState title="还没有订单" description="创建第一笔订单后，这里会显示最近记录。" icon="Document">
              <el-button v-if="canCreateOrder" type="primary" size="small" @click="router.push('/orders/create')">
                新建订单
              </el-button>
            </EmptyState>
          </template>
        </el-table>

        <div v-else class="permission-empty">
          <el-icon :size="26"><Lock /></el-icon>
          <div>
            <strong>当前角色没有订单查看权限</strong>
            <p>请联系管理员分配 <code>order:read</code> 权限。</p>
          </div>
        </div>
      </article>

      <aside class="dashboard-side">
        <article class="panel panel--profile">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">MY WORKSPACE</span>
              <h2>我的角色</h2>
            </div>
            <el-button text type="primary" @click="router.push('/profile')">个人中心</el-button>
          </div>
          <div class="role-strip">
            <el-tag v-for="role in auth.roles" :key="role" effect="plain" round>{{ ROLE_LABELS[role] || role }}</el-tag>
            <span v-if="!auth.roles.length" class="muted-text">未分配角色</span>
          </div>
          <div class="permission-meter">
            <div class="permission-meter__head">
              <span>权限覆盖</span>
              <strong>{{ auth.permissions.length }}</strong>
            </div>
            <div class="permission-meter__track">
              <span :style="{ width: `${Math.min(100, auth.permissions.length * 6)}%` }"></span>
            </div>
            <p>权限由 JWT 声明下发，页面隐藏只是体验优化，服务端仍会逐次校验。</p>
          </div>
          <el-button class="wide-button" @click="router.push('/system/permissions')">
            <el-icon><Key /></el-icon>查看权限矩阵
          </el-button>
        </article>

        <article class="panel panel--roadmap">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">NEXT MILESTONES</span>
              <h2>建设路线</h2>
            </div>
          </div>
          <button
            v-for="item in roadmapPreview"
            :key="item.key"
            class="roadmap-row"
            type="button"
            @click="router.push(`/modules/${item.key}`)"
          >
            <span class="roadmap-row__code" :style="{ color: item.color }">{{ item.code }}</span>
            <span class="roadmap-row__body">
              <strong>{{ item.name }}</strong>
              <small>{{ item.summary }}</small>
            </span>
            <el-icon><ArrowRight /></el-icon>
          </button>
          <div class="roadmap-note">
            <el-icon><UserFilled /></el-icon>
            首页工作台与经营大屏已接入真实聚合接口；其余业务模块将按 V1.4 优先级逐步接入。
          </div>
        </article>
      </aside>
    </section>

    <el-dialog v-model="metricsVisible" title="指标口径与数据源" width="920px" destroy-on-close>
      <p class="metrics-dialog__hint">
        口径以 V1.4 第 11 章为准。可计算指标来自 BI 事实表；未接入数据源的指标只做标记，
        不使用零值或估算值替代。
      </p>
      <el-table v-loading="metricsLoading" :data="metrics" max-height="520" size="small">
        <el-table-column label="指标" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <div class="muted-text mono-text">{{ row.code }}</div>
          </template>
        </el-table-column>
        <el-table-column label="分类" prop="category" width="82" />
        <el-table-column label="状态" width="102">
          <template #default="{ row }">
            <el-tag :type="metricTagType(row.status)" effect="plain" round size="small">
              {{ metricStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="口径" prop="definition" min-width="330" show-overflow-tooltip />
        <el-table-column label="数据源 / 待补原因" prop="sourceNote" min-width="260" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button @click="metricsVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.bi-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bi-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.bi-meta__left {
  display: flex;
  align-items: baseline;
  gap: 14px;
  min-width: 0;
}

.bi-meta__eyebrow {
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.bi-meta__sync {
  color: #94a3b8;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-meta__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.bi-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}

.bi-card {
  --bi-accent: #0f8a78;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: linear-gradient(145deg, #fff 0%, #fbfdfc 100%);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.bi-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--bi-accent) 35%, #e2e8f0);
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08);
}

.bi-card--blue { --bi-accent: #2563eb; }
.bi-card--amber { --bi-accent: #d97706; }
.bi-card--rose { --bi-accent: #e11d48; }
.bi-card--violet { --bi-accent: #7c3aed; }
.bi-card--green { --bi-accent: #16a34a; }

.bi-card__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  color: var(--bi-accent);
  background: color-mix(in srgb, var(--bi-accent) 12%, #fff);
}

.bi-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.bi-card__body small {
  color: #64748b;
  font-size: 12px;
}

.bi-card__body strong {
  color: #0f172a;
  font-size: 24px;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bi-card__body strong em {
  margin-left: 4px;
  color: #64748b;
  font-size: 12px;
  font-style: normal;
  font-weight: 500;
}

.bi-card__body > span {
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.35;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.bi-insight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 1fr);
  gap: 16px;
}

.bi-panel {
  min-width: 0;
  padding: 18px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.035);
}

.bi-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.bi-panel__head h3 {
  margin: 2px 0 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 700;
}

.bi-panel__note {
  color: #94a3b8;
  font-size: 11px;
  white-space: nowrap;
}

.bi-risk-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.risk-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 8px;
}

.risk-row {
  --risk-color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  border: 1px solid #eef2f7;
  border-radius: 12px;
  background: #fbfdff;
  cursor: pointer;
}

.risk-row:hover {
  border-color: color-mix(in srgb, var(--risk-color) 35%, #eef2f7);
}

.risk-row--high { --risk-color: #e11d48; }
.risk-row--medium { --risk-color: #d97706; }
.risk-row--low { --risk-color: #0f766e; }

.risk-row__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 50%;
  background: var(--risk-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--risk-color) 12%, transparent);
}

.risk-row__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.risk-row__body strong {
  color: #1e293b;
  font-size: 13px;
}

.risk-row__body small {
  color: #64748b;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.risk-row__count {
  flex: none;
  color: var(--risk-color);
  font-size: 16px;
  font-weight: 700;
}

.risk-row > .el-icon {
  color: #cbd5e1;
  flex: none;
}

.bi-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 190px;
  color: #94a3b8;
  text-align: center;
}

.bi-panel__empty--compact {
  min-height: 90px;
}

.bi-panel__empty strong {
  color: #475569;
  font-size: 13px;
}

.bi-panel__empty span {
  font-size: 11px;
}

.pending-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  padding: 9px 12px;
  color: #64748b;
  font-size: 12px;
  text-align: left;
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
}

.pending-strip:hover {
  color: #0f766e;
  border-color: #5eead4;
}

.metrics-dialog__hint {
  margin: 0 0 14px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .bi-insight-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .bi-meta,
  .bi-meta__left {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .bi-card-grid {
    grid-template-columns: 1fr 1fr;
  }

  .bi-card {
    padding: 12px;
  }

  .bi-card__body strong {
    font-size: 20px;
  }
}
</style>
