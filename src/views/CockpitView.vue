<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Clock,
  Coin,
  Cpu,
  CreditCard,
  DataAnalysis,
  FullScreen,
  Money,
  Refresh,
  Tickets,
  TrendCharts,
  Wallet,
  Warning,
} from '@element-plus/icons-vue'
import ChartPanel from '@/components/ChartPanel.vue'
import { fetchBiDashboard } from '@/api/bi'
import { useAuthStore } from '@/stores/auth'

/**
 * 经营大屏。
 *
 * 页面按 16:9 设计，在 1920×1080 和 3840×2160 下按视口比例缩放，不出现滚动条。
 * 数据只来自平台 BI 聚合接口，前端不拼接业务 SQL，也不展示客户联系方式等敏感
 * 明细。刷新失败时保留上一版快照，只更新“最后同步时间”，不向展厅屏幕抛错误。
 */
const auth = useAuthStore()
const router = useRouter()

const bi = ref(null)
const loading = ref(true)
const refreshing = ref(false)
const errorText = ref('')
const now = ref(new Date())
const viewportWidth = ref(typeof window === 'undefined' ? 1920 : window.innerWidth)
const isFullscreen = ref(false)

let clockTimer = null
let refreshTimer = null

const cardPriority = [
  'month_order_amount',
  'month_receipt_amount',
  'receivable_balance',
  'overdue_receivable',
  'credit_over_limit_customers',
  'pending_approval_count',
  'equipment_queue_wait',
  'inventory_amount',
  'equipment_fault_count',
]
const cardIcons = {
  month_order_amount: Tickets,
  month_receipt_amount: Wallet,
  receivable_balance: Money,
  overdue_receivable: Warning,
  credit_over_limit_customers: CreditCard,
  pending_approval_count: Coin,
  equipment_queue_wait: Clock,
  inventory_amount: DataAnalysis,
  equipment_fault_count: Cpu,
}

const scopeText = computed(() => bi.value?.meta?.scopeLabel || '当前数据范围')
const dataStatus = computed(() => bi.value?.meta?.dataStatus || 'NO_DATA')
const dataStatusText = computed(() => {
  if (dataStatus.value === 'STALE') return '数据刷新延迟'
  if (dataStatus.value === 'NO_DATA') return '等待首次同步'
  return '数据已同步'
})
const lastUpdatedText = computed(() => bi.value?.meta?.dataUpdatedAt || '尚未同步')
const refreshSeconds = computed(() => Number(bi.value?.meta?.refreshIntervalSeconds || 300))
const autoRefreshText = computed(() => `每 ${Math.max(1, Math.round(refreshSeconds.value / 60))} 分钟自动刷新`)
const clockText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))
const clockDate = computed(() => now.value.toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
}))
const pendingCount = computed(() => bi.value?.pendingMetrics?.length || 0)
const alerts = computed(() => (bi.value?.alerts || []).slice(0, 4))
const chartScale = computed(() => Math.min(2.2, Math.max(1, viewportWidth.value / 1920)))
const chartFontSize = computed(() => Math.round(11 * chartScale.value))

const cards = computed(() => {
  const available = new Map((bi.value?.cards || []).map((card) => [card.code, card]))
  const ordered = []
  for (const code of cardPriority) {
    const card = available.get(code)
    if (card) {
      ordered.push(card)
      available.delete(code)
    }
  }
  for (const card of available.values()) {
    ordered.push(card)
  }
  return ordered.slice(0, 6)
})

const trendOption = computed(() => {
  const trend = bi.value?.orderTrend
  const months = (trend?.months || []).map((month) => `${Number(month.slice(5))}月`)
  const orderAmounts = (trend?.orderAmounts || []).map((value) => Number(value))
  const receiptAmounts = (trend?.receiptAmounts || []).map((value) => Number(value))
  return {
    backgroundColor: 'transparent',
    color: ['#5eead4', '#60a5fa'],
    grid: { left: 10, right: 20, top: 36, bottom: 20, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(6, 16, 31, 0.94)',
      borderColor: 'rgba(94, 234, 212, 0.35)',
      textStyle: { color: '#e2e8f0', fontSize: chartFontSize.value },
      valueFormatter: (value) => formatMoney(Number(value)),
    },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#93b4cf', fontSize: chartFontSize.value },
    },
    xAxis: {
      type: 'category',
      data: months,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
      axisTick: { show: false },
      axisLabel: { color: '#93b4cf', fontSize: chartFontSize.value },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.13)' } },
      axisLabel: {
        color: '#93b4cf',
        fontSize: chartFontSize.value,
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
        lineStyle: { width: 2, color: '#5eead4' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(94, 234, 212, 0.24)' },
              { offset: 1, color: 'rgba(94, 234, 212, 0.01)' },
            ],
          },
        },
      },
      {
        name: '收款',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        data: receiptAmounts,
        lineStyle: { width: 1.6, type: 'dashed', color: '#60a5fa' },
      },
    ],
  }
})

const equipmentOption = computed(() => ({
  backgroundColor: 'transparent',
  color: ['#34d399', '#60a5fa', '#fbbf24', '#fb7185', '#64748b'],
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(6, 16, 31, 0.94)',
    borderColor: 'rgba(94, 234, 212, 0.35)',
    textStyle: { color: '#e2e8f0', fontSize: chartFontSize.value },
    formatter: '{b}: {c} 台 ({d}%)',
  },
  legend: {
    bottom: 0,
    left: 'center',
    itemWidth: 8,
    itemHeight: 8,
    textStyle: { color: '#93b4cf', fontSize: chartFontSize.value },
  },
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '43%'],
      label: { show: false },
      data: (bi.value?.equipmentStatus || []).map((item) => ({
        name: item.label,
        value: Number(item.count || 0),
      })),
    },
  ],
}))

const orderStatusOption = computed(() => ({
  backgroundColor: 'transparent',
  color: ['#5eead4', '#60a5fa', '#fbbf24', '#a78bfa', '#fb7185'],
  tooltip: {
    trigger: 'item',
    backgroundColor: 'rgba(6, 16, 31, 0.94)',
    borderColor: 'rgba(94, 234, 212, 0.35)',
    textStyle: { color: '#e2e8f0', fontSize: chartFontSize.value },
    formatter: '{b}: {c} 笔 ({d}%)',
  },
  legend: {
    bottom: 0,
    left: 'center',
    itemWidth: 8,
    itemHeight: 8,
    textStyle: { color: '#93b4cf', fontSize: chartFontSize.value },
  },
  series: [
    {
      type: 'pie',
      radius: ['46%', '68%'],
      center: ['50%', '43%'],
      label: { show: false },
      data: (bi.value?.orderStatus || []).map((item) => ({
        name: item.label,
        value: Number(item.count || 0),
      })),
    },
  ],
}))

const factoryOption = computed(() => {
  const rows = [...(bi.value?.factoryComparison || [])].slice(0, 6).reverse()
  return {
    backgroundColor: 'transparent',
    color: ['#5eead4'],
    grid: { left: 8, right: 34, top: 10, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(6, 16, 31, 0.94)',
      borderColor: 'rgba(94, 234, 212, 0.35)',
      textStyle: { color: '#e2e8f0', fontSize: chartFontSize.value },
      valueFormatter: (value) => formatMoney(Number(value)),
    },
    xAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.13)' } },
      axisLabel: { color: '#93b4cf', fontSize: chartFontSize.value, formatter: (value) => compactMoney(value) },
    },
    yAxis: {
      type: 'category',
      data: rows.map((item) => item.factoryName),
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.25)' } },
      axisLabel: { color: '#c7d9e9', fontSize: chartFontSize.value },
    },
    series: [
      {
        type: 'bar',
        barWidth: '45%',
        data: rows.map((item) => Number(item.orderAmount || 0)),
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: 'rgba(94, 234, 212, 0.32)' },
              { offset: 1, color: '#5eead4' },
            ],
          },
        },
      },
    ],
  }
})

function cardIcon(code) {
  return cardIcons[code] || DataAnalysis
}

function showUnit(card) {
  if (!card?.unit) return false
  return !String(card.display || '').includes('¥')
    && !String(card.display || '').includes('万')
    && !String(card.display || '').includes('%')
}

function compactMoney(cents) {
  const yuan = Number(cents) / 100
  if (!Number.isFinite(yuan)) return '0'
  if (Math.abs(yuan) >= 10000) return `${(yuan / 10000).toFixed(1)}万`
  if (Math.abs(yuan) >= 1000) return `${(yuan / 1000).toFixed(0)}千`
  return String(Math.round(yuan))
}

function formatMoney(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value)) return '¥0.00'
  return `¥${(value / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function severityClass(severity) {
  return `cockpit-risk--${String(severity || 'low').toLowerCase()}`
}

function statusDotClass() {
  if (dataStatus.value === 'STALE') return 'is-warning'
  if (dataStatus.value === 'NO_DATA') return 'is-muted'
  return 'is-ok'
}

async function load({ silent = false } = {}) {
  if (!silent) loading.value = true
  refreshing.value = true
  try {
    bi.value = await fetchBiDashboard()
    errorText.value = ''
  } catch {
    // 大屏不展示接口错误堆栈；保留上一版快照，只提示刷新延迟。
    errorText.value = '数据暂不可用，显示最近一次成功同步结果'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function goBack() {
  router.push('/dashboard')
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch {
    // 浏览器禁止全屏时保持普通模式，不打断展示。
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

function handleResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  load()
  clockTimer = window.setInterval(() => { now.value = new Date() }, 1000)
  refreshTimer = window.setInterval(() => load({ silent: true }), 300000)
  window.addEventListener('resize', handleResize)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onBeforeUnmount(() => {
  window.clearInterval(clockTimer)
  window.clearInterval(refreshTimer)
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})
</script>

<template>
  <div class="cockpit-page">
    <div class="cockpit-frame">
      <header class="cockpit-header">
        <div class="cockpit-brand">
          <span class="cockpit-brand__mark"><el-icon><TrendCharts /></el-icon></span>
          <div class="cockpit-brand__text">
            <strong>公司经营驾驶舱</strong>
            <small>COMPANY OPERATIONS · V1.4</small>
          </div>
        </div>

        <div class="cockpit-header__meta">
          <span class="cockpit-header__item"><el-icon><DataAnalysis /></el-icon>{{ scopeText }}</span>
          <span class="cockpit-header__item"><el-icon><Clock /></el-icon>{{ lastUpdatedText }}</span>
          <span class="cockpit-clock">{{ clockDate }} {{ clockText }}</span>
        </div>

        <div class="cockpit-header__actions">
          <button class="cockpit-action" type="button" title="刷新" @click="load({ silent: true })">
            <el-icon :class="{ 'is-spinning': refreshing }"><Refresh /></el-icon>
          </button>
          <button class="cockpit-action" type="button" title="全屏" @click="toggleFullscreen">
            <el-icon><FullScreen /></el-icon>
          </button>
          <button class="cockpit-action cockpit-action--back" type="button" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>返回工作台
          </button>
        </div>
      </header>

      <div class="cockpit-status">
        <span class="cockpit-status__dot" :class="statusDotClass()"></span>
        <span>{{ dataStatusText }} · {{ autoRefreshText }}</span>
        <span v-if="errorText" class="cockpit-status__error">{{ errorText }}</span>
      </div>

      <main class="cockpit-main">
        <section class="cockpit-kpis">
          <article v-for="card in cards" :key="card.code" class="cockpit-kpi">
            <div class="cockpit-kpi__top">
              <span>{{ card.label }}</span>
              <el-icon><component :is="cardIcon(card.code)" /></el-icon>
            </div>
            <strong>
              {{ card.display }}
              <em v-if="showUnit(card)">{{ card.unit }}</em>
            </strong>
            <small>{{ card.hint }}</small>
          </article>
          <article v-if="!cards.length" class="cockpit-kpi cockpit-kpi--empty">
            <div class="cockpit-kpi__top"><span>经营指标</span><el-icon><DataAnalysis /></el-icon></div>
            <strong>{{ loading ? '同步中' : '无可用指标' }}</strong>
            <small v-if="loading">正在读取 BI 聚合数据</small>
            <small v-else>当前账号缺少经营指标所需的业务查看权限，或 BI 尚未完成首次同步</small>
          </article>
        </section>

        <section class="cockpit-grid">
          <article class="cockpit-panel cockpit-panel--trend">
            <div class="cockpit-panel__head">
              <div>
                <span class="cockpit-eyebrow">ORDER &amp; CASHFLOW</span>
                <h2>订单与收款趋势</h2>
              </div>
              <span class="cockpit-panel__note">近 12 个月</span>
            </div>
            <div class="cockpit-panel__body">
              <ChartPanel
                :option="trendOption"
                height="100%"
                :empty="!bi?.orderTrend?.months?.length"
                empty-text="等待 BI 数据"
              />
            </div>
          </article>

          <article class="cockpit-panel cockpit-panel--ring">
            <div class="cockpit-panel__head">
              <div>
                <span class="cockpit-eyebrow">EQUIPMENT</span>
                <h2>设备状态</h2>
              </div>
            </div>
            <div class="cockpit-panel__body">
              <ChartPanel
                :option="equipmentOption"
                height="100%"
                :empty="!bi?.equipmentStatus?.length"
                empty-text="暂无设备数据"
              />
            </div>
          </article>

          <article class="cockpit-panel cockpit-panel--ring">
            <div class="cockpit-panel__head">
              <div>
                <span class="cockpit-eyebrow">ORDERS</span>
                <h2>本月订单状态</h2>
              </div>
            </div>
            <div class="cockpit-panel__body">
              <ChartPanel
                :option="orderStatusOption"
                height="100%"
                :empty="!bi?.orderStatus?.length"
                empty-text="本月暂无订单"
              />
            </div>
          </article>

          <article class="cockpit-panel cockpit-panel--factory">
            <div class="cockpit-panel__head">
              <div>
                <span class="cockpit-eyebrow">FACTORY COMPARISON</span>
                <h2>工厂订单对比</h2>
              </div>
              <span class="cockpit-panel__note">本月订单额</span>
            </div>
            <div class="cockpit-panel__body">
              <ChartPanel
                :option="factoryOption"
                height="100%"
                :empty="!bi?.factoryComparison?.length"
                empty-text="暂无工厂订单"
              />
            </div>
          </article>

          <article class="cockpit-panel cockpit-panel--risk">
            <div class="cockpit-panel__head">
              <div>
                <span class="cockpit-eyebrow">RISK ALERT</span>
                <h2>风险预警</h2>
              </div>
              <span class="cockpit-panel__badge">{{ alerts.length ? `${alerts.length} 项` : '正常' }}</span>
            </div>
            <div v-if="alerts.length" class="cockpit-risk-list">
              <div v-for="alert in alerts" :key="alert.type" class="cockpit-risk" :class="severityClass(alert.severity)">
                <span class="cockpit-risk__dot"></span>
                <div class="cockpit-risk__body">
                  <strong>{{ alert.title }}</strong>
                  <small>{{ alert.detail }}</small>
                </div>
                <span v-if="Number(alert.count) > 0" class="cockpit-risk__count">{{ alert.count }}</span>
              </div>
            </div>
            <div v-else class="cockpit-empty">
              <el-icon :size="22"><DataAnalysis /></el-icon>
              <span>暂无风险预警</span>
            </div>
          </article>
        </section>
      </main>

      <footer class="cockpit-footer">
        <span class="cockpit-footer__pulse"></span>
        <span>数据范围：{{ scopeText }}</span>
        <span class="cockpit-footer__divider"></span>
        <span>最后同步：{{ lastUpdatedText }}</span>
        <span class="cockpit-footer__divider"></span>
        <span class="cockpit-footer__pending">
          {{ pendingCount ? `${pendingCount} 项指标待数据源` : '全部已接入指标正常' }}
        </span>
        <span class="cockpit-footer__hint">金额单位：元 · 按 V1.4 口径直接截断</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.cockpit-page {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 12% 8%, rgba(13, 148, 136, 0.2), transparent 30%),
    radial-gradient(circle at 88% 88%, rgba(37, 99, 235, 0.16), transparent 34%),
    #040b16;
  color: #dbeafe;
}

.cockpit-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw * 9 / 16));
  min-height: 0;
  padding: 1.1em 1.35em 0.9em;
  overflow: hidden;
  font-size: clamp(12px, 0.72vw, 26px);
  background:
    linear-gradient(180deg, rgba(8, 23, 42, 0.96), rgba(4, 11, 22, 0.98)),
    #040b16;
  box-shadow: inset 0 0 0 1px rgba(94, 234, 212, 0.1);
}

.cockpit-frame::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(94, 234, 212, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(94, 234, 212, 0.035) 1px, transparent 1px);
  background-size: 2.4em 2.4em;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent 75%);
  content: '';
}

.cockpit-header,
.cockpit-status,
.cockpit-main,
.cockpit-footer {
  position: relative;
  z-index: 1;
}

.cockpit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  flex: none;
  padding-bottom: 0.75em;
  border-bottom: 1px solid rgba(94, 234, 212, 0.12);
}

.cockpit-brand {
  display: flex;
  align-items: center;
  gap: 0.7em;
  min-width: 0;
}

.cockpit-brand__mark {
  display: grid;
  place-items: center;
  width: 2.8em;
  height: 2.8em;
  flex: none;
  border: 1px solid rgba(94, 234, 212, 0.4);
  border-radius: 0.7em;
  background: rgba(45, 212, 191, 0.1);
  color: #5eead4;
  font-size: 1em;
  box-shadow: 0 0 1.5em rgba(45, 212, 191, 0.14);
}

.cockpit-brand__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.15em;
}

.cockpit-brand__text strong {
  color: #f0fdfa;
  font-size: 1.35em;
  letter-spacing: 0.12em;
  white-space: nowrap;
}

.cockpit-brand__text small {
  color: #5eead4;
  font-size: 0.55em;
  letter-spacing: 0.24em;
  opacity: 0.72;
  white-space: nowrap;
}

.cockpit-header__meta {
  display: flex;
  align-items: center;
  gap: 1.25em;
  min-width: 0;
  color: #93b4cf;
  font-size: 0.7em;
}

.cockpit-header__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  white-space: nowrap;
}

.cockpit-header__item .el-icon {
  color: #5eead4;
}

.cockpit-clock {
  min-width: 11em;
  color: #dbeafe;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.cockpit-header__actions {
  display: flex;
  align-items: center;
  gap: 0.45em;
  flex: none;
}

.cockpit-action {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  height: 2.2em;
  padding: 0 0.7em;
  color: #a7c4dc;
  font-size: 0.68em;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 0.5em;
  background: rgba(15, 35, 58, 0.75);
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.cockpit-action:hover {
  color: #5eead4;
  border-color: rgba(94, 234, 212, 0.45);
  background: rgba(13, 148, 136, 0.12);
}

.cockpit-action--back {
  padding: 0 0.85em;
}

.is-spinning {
  animation: cockpit-spin 0.8s linear infinite;
}

@keyframes cockpit-spin {
  to { transform: rotate(360deg); }
}

.cockpit-status {
  display: flex;
  align-items: center;
  gap: 0.5em;
  flex: none;
  padding: 0.55em 0.15em;
  color: #7f9bb8;
  font-size: 0.64em;
}

.cockpit-status__dot {
  width: 0.55em;
  height: 0.55em;
  border-radius: 50%;
  background: #5eead4;
  box-shadow: 0 0 0.7em rgba(94, 234, 212, 0.7);
}

.cockpit-status__dot.is-warning {
  background: #fbbf24;
  box-shadow: 0 0 0.7em rgba(251, 191, 36, 0.6);
}

.cockpit-status__dot.is-muted {
  background: #64748b;
  box-shadow: none;
}

.cockpit-status__error {
  margin-left: 0.7em;
  color: #fbbf24;
}

.cockpit-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 1em;
}

.cockpit-kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.8em;
  flex: none;
}

.cockpit-kpi {
  min-width: 0;
  padding: 0.9em 1em;
  border: 1px solid rgba(94, 234, 212, 0.13);
  border-radius: 0.75em;
  background: linear-gradient(150deg, rgba(13, 38, 62, 0.84), rgba(7, 20, 37, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.cockpit-kpi__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  color: #93b4cf;
  font-size: 0.66em;
  letter-spacing: 0.04em;
}

.cockpit-kpi__top .el-icon {
  color: #5eead4;
  font-size: 1.15em;
}

.cockpit-kpi strong {
  display: block;
  margin: 0.25em 0 0.15em;
  overflow: hidden;
  color: #f0fdfa;
  font-size: 1.55em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cockpit-kpi strong em {
  margin-left: 0.25em;
  color: #93b4cf;
  font-size: 0.4em;
  font-style: normal;
  font-weight: 500;
}

.cockpit-kpi small {
  display: block;
  overflow: hidden;
  color: #647f99;
  font-size: 0.56em;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cockpit-kpi--empty strong {
  color: #fbbf24;
}

.cockpit-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  gap: 0.9em;
  grid-template-columns: 1.45fr 0.8fr 0.8fr;
  grid-template-rows: minmax(0, 1fr) minmax(0, 0.92fr);
  grid-template-areas:
    'trend equipment orderstatus'
    'trend factory risk';
}

.cockpit-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 0.9em 1em 0.8em;
  border: 1px solid rgba(94, 234, 212, 0.12);
  border-radius: 0.75em;
  background: rgba(8, 24, 43, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

.cockpit-panel--trend { grid-area: trend; }
.cockpit-panel--ring { grid-area: equipment; }
.cockpit-panel--ring + .cockpit-panel--ring { grid-area: orderstatus; }
.cockpit-panel--factory { grid-area: factory; }
.cockpit-panel--risk { grid-area: risk; }

.cockpit-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6em;
  flex: none;
  margin-bottom: 0.25em;
}

.cockpit-eyebrow {
  display: block;
  color: #3f6b8f;
  font-size: 0.52em;
  letter-spacing: 0.18em;
}

.cockpit-panel h2 {
  margin: 0.15em 0 0;
  color: #dbeafe;
  font-size: 0.88em;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.cockpit-panel__note {
  color: #647f99;
  font-size: 0.56em;
  white-space: nowrap;
}

.cockpit-panel__badge {
  padding: 0.15em 0.5em;
  color: #5eead4;
  font-size: 0.56em;
  border: 1px solid rgba(94, 234, 212, 0.22);
  border-radius: 999px;
  white-space: nowrap;
}

.cockpit-panel__body {
  flex: 1;
  min-height: 0;
}

.cockpit-risk-list {
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  min-height: 0;
  overflow: hidden;
}

.cockpit-risk {
  --risk-color: #5eead4;
  display: flex;
  align-items: center;
  gap: 0.55em;
  min-width: 0;
  padding: 0.48em 0.55em;
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.45em;
  background: rgba(15, 35, 58, 0.55);
}

.cockpit-risk--high { --risk-color: #fb7185; }
.cockpit-risk--medium { --risk-color: #fbbf24; }
.cockpit-risk--low { --risk-color: #5eead4; }

.cockpit-risk__dot {
  width: 0.5em;
  height: 0.5em;
  flex: none;
  border-radius: 50%;
  background: var(--risk-color);
  box-shadow: 0 0 0.6em color-mix(in srgb, var(--risk-color) 65%, transparent);
}

.cockpit-risk__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 0.08em;
}

.cockpit-risk__body strong {
  color: #dbeafe;
  font-size: 0.65em;
  font-weight: 600;
}

.cockpit-risk__body small {
  overflow: hidden;
  color: #7f9bb8;
  font-size: 0.55em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cockpit-risk__count {
  flex: none;
  color: var(--risk-color);
  font-size: 0.8em;
  font-weight: 700;
}

.cockpit-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35em;
  color: #647f99;
  font-size: 0.62em;
}

.cockpit-empty .el-icon {
  color: #2dd4bf;
  opacity: 0.6;
}

.cockpit-footer {
  display: flex;
  align-items: center;
  gap: 0.7em;
  flex: none;
  padding-top: 0.65em;
  color: #5f7b95;
  font-size: 0.56em;
  border-top: 1px solid rgba(94, 234, 212, 0.08);
}

.cockpit-footer__pulse {
  width: 0.5em;
  height: 0.5em;
  border-radius: 50%;
  background: #5eead4;
  box-shadow: 0 0 0.6em rgba(94, 234, 212, 0.75);
}

.cockpit-footer__divider {
  width: 1px;
  height: 0.9em;
  background: rgba(148, 163, 184, 0.18);
}

.cockpit-footer__pending {
  color: #fbbf24;
}

.cockpit-footer__hint {
  margin-left: auto;
  color: #47637e;
}

@media (max-width: 980px) {
  .cockpit-frame {
    width: 100vw;
    height: 100vh;
    padding: 0.8em;
    font-size: 12px;
  }

  .cockpit-header {
    flex-wrap: wrap;
  }

  .cockpit-header__meta {
    display: none;
  }

  .cockpit-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cockpit-grid {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr);
    grid-template-areas:
      'trend trend'
      'equipment orderstatus'
      'factory risk';
  }

  .cockpit-footer__hint {
    display: none;
  }
}
</style>
