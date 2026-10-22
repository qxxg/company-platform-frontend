<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Back,
  CircleCheck,
  CopyDocument,
  Refresh,
  Tickets,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import OrderStatusTag from '@/components/OrderStatusTag.vue'
import EmptyState from '@/components/EmptyState.vue'
import { fetchOrder } from '@/api/order'
import { fetchWorkOrdersByOrder } from '@/api/production'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { QUEUE_STATUS, WORK_ORDER_STATUS, workOrderStatusLabel } from '@/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const order = ref(null)
const factories = ref([])
const workOrders = ref([])
const workOrderLoading = ref(false)
const workOrderError = ref('')

const canReadWorkOrders = computed(() => auth.hasPermission('production:schedule:read'))
const canViewCost = computed(() => auth.hasPermission('production:cost:read'))
const canIssueMaterial = computed(() => auth.hasPermission('warehouse:outbound'))

const factoryName = computed(() => {
  const match = factories.value.find((item) => String(item.id) === String(order.value?.factoryId))
  return match?.name || (order.value?.factoryId ? `工厂 #${order.value.factoryId}` : '—')
})

const shardInfo = computed(() => {
  if (!order.value?.orderNo) return null
  try {
    const value = BigInt(String(order.value.orderNo))
    return {
      database: Number(value % 2n),
      table: Number((value >> 1n) % 4n),
    }
  } catch {
    return null
  }
})

const flowSteps = [
  { title: '订单创建', description: '订单号生成并写入分片' },
  { title: '合同与信用校验', description: '合同已录入、额度与逾期检查' },
  { title: '排产与设备分配', description: '同工厂工单与 FIFO 队列' },
  { title: '生产执行', description: '开始/完成工单，设备状态联动' },
  { title: '发货与签收', description: '出库、物流与回款（规划）' },
]

function workOrderTagType(status) {
  return WORK_ORDER_STATUS[status]?.type || 'info'
}

function queueStatusLabel(value) {
  return QUEUE_STATUS[value]?.label || value || '—'
}

const activeStep = computed(() => {
  const status = order.value?.orderStatus
  if (status === 'COMPLETED') return 5
  if (status === 'IN_PRODUCTION') return 4
  if (status === 'QUEUED') return 3
  if (status === 'CANCELLED') return 0
  return 2
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    order.value = await fetchOrder(route.params.orderNo)
    if (auth.hasPermission('system:factory:list')) {
      try {
        factories.value = (await fetchFactories()) || []
      } catch {
        factories.value = []
      }
    }
    if (canReadWorkOrders.value) {
      loadWorkOrders()
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    order.value = null
  } finally {
    loading.value = false
  }
}

/** 工单进度独立加载，避免排产接口异常阻断订单主数据展示。 */
async function loadWorkOrders() {
  workOrderLoading.value = true
  workOrderError.value = ''
  try {
    workOrders.value = (await fetchWorkOrdersByOrder(route.params.orderNo)) || []
  } catch (error) {
    workOrderError.value = errorMessage(error)
    workOrders.value = []
  } finally {
    workOrderLoading.value = false
  }
}

async function copyOrderNo() {
  try {
    await navigator.clipboard.writeText(String(order.value?.orderNo || ''))
    ElMessage.success('订单号已复制')
  } catch {
    ElMessage.warning('浏览器不允许访问剪贴板，请手动复制')
  }
}

/** 跳转到领料页并按工单过滤，方便直接为该工单登记领料。 */
function openMaterialIssue(workOrder) {
  router.push({ path: '/warehouse/material-issues', query: { workOrderId: workOrder.id } })
}

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="ORDER DETAIL"
      :title="order ? `订单 ${order.orderNo}` : '订单详情'"
      description="订单主数据、合同关联、分片路由与生产工单进度。发货与回款链路将在对应模块接入后补齐。"
    >
      <template #actions>
        <el-button @click="router.push('/orders')"><el-icon><Back /></el-icon>返回列表</el-button>
        <el-button :loading="loading" @click="load"><el-icon><Refresh /></el-icon>刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="loadError"
      type="error"
      :title="loadError"
      :closable="false"
      show-icon
      class="section-alert"
    >
      <template #default>请确认订单号完整，且当前账号拥有 order:read 权限。</template>
    </el-alert>

    <template v-if="order">
      <section class="detail-banner">
        <div class="detail-banner__main">
          <div class="detail-banner__icon"><el-icon :size="30"><Tickets /></el-icon></div>
          <div>
            <div class="detail-banner__eyebrow">ORDER NUMBER</div>
            <div class="detail-banner__number">
              <span class="mono-text">{{ order.orderNo }}</span>
              <el-button text circle size="small" aria-label="复制订单号" @click="copyOrderNo">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
        <div class="detail-banner__side">
          <OrderStatusTag :status="order.orderStatus" />
          <span class="detail-banner__amount">{{ formatMoney(order.totalAmount, order.currency) }}</span>
        </div>
      </section>

      <div class="detail-grid">
        <section class="panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">ORDER HEADER</span>
              <h2>基础信息</h2>
            </div>
            <span v-if="shardInfo" class="shard-chip">
              ds_{{ shardInfo.database }} · t_order_{{ shardInfo.table }}
            </span>
          </div>

          <el-descriptions :column="2" border class="detail-descriptions">
            <el-descriptions-item label="订单号"><span class="mono-text">{{ order.orderNo }}</span></el-descriptions-item>
            <el-descriptions-item label="订单状态"><OrderStatusTag :status="order.orderStatus" size="small" /></el-descriptions-item>
            <el-descriptions-item label="客户编号">#{{ order.customerId }}</el-descriptions-item>
            <el-descriptions-item label="关联合同">
              <span v-if="order.contractId" class="mono-text">#{{ order.contractId }}</span>
              <span v-else class="muted-text">历史订单未关联合同</span>
            </el-descriptions-item>
            <el-descriptions-item label="生产工厂">{{ factoryName }}</el-descriptions-item>
            <el-descriptions-item label="订单金额">{{ formatMoney(order.totalAmount, order.currency) }}</el-descriptions-item>
            <el-descriptions-item label="币种">{{ order.currency }}</el-descriptions-item>
            <el-descriptions-item label="创建人">#{{ order.createdBy }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDateTime(order.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间" :span="2">{{ formatDateTime(order.updatedAt) }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">
              <span v-if="order.remark">{{ order.remark }}</span>
              <span v-else class="muted-text">无备注</span>
            </el-descriptions-item>
          </el-descriptions>
        </section>

        <aside class="detail-side">
          <section class="panel">
            <div class="panel__head">
              <div>
                <span class="panel__eyebrow">SHARD ROUTING</span>
                <h2>分片路由</h2>
              </div>
            </div>
            <div v-if="shardInfo" class="shard-visual">
              <div class="shard-node">
                <small>数据库</small>
                <strong>ds_{{ shardInfo.database }}</strong>
                <span>company_order{{ shardInfo.database }}</span>
              </div>
              <div class="shard-arrow">→</div>
              <div class="shard-node">
                <small>物理表</small>
                <strong>t_order_{{ shardInfo.table }}</strong>
                <span>order_no 精确命中</span>
              </div>
            </div>
            <p class="shard-formula">
              库：<code>order_no % 2</code><br />
              表：<code>(order_no >> 1) % 4</code>
            </p>
          </section>

          <section class="panel">
            <div class="panel__head">
              <div>
                <span class="panel__eyebrow">GUARDRAILS</span>
                <h2>业务校验</h2>
              </div>
            </div>
            <ul class="check-list">
              <li class="is-done"><el-icon><CircleCheck /></el-icon>金额以分存储并截断</li>
              <li class="is-done"><el-icon><CircleCheck /></el-icon>订单归属唯一工厂</li>
              <li class="is-done"><el-icon><CircleCheck /></el-icon>合同必须为“已录入”</li>
              <li class="is-done"><el-icon><CircleCheck /></el-icon>信用额度与逾期阻断</li>
            </ul>
          </section>
        </aside>
      </div>

      <section v-if="canReadWorkOrders" class="panel table-panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">WORK ORDERS</span>
            <h2>生产工单</h2>
          </div>
          <span class="table-panel__meta">订单完成时间以最后一个工单完成为准</span>
        </div>

        <el-alert
          v-if="workOrderError"
          type="error"
          :title="workOrderError"
          :closable="false"
          show-icon
          class="section-alert"
        />

        <el-table v-loading="workOrderLoading" :data="workOrders" class="data-table" row-key="id">
          <el-table-column label="工单号" min-width="190">
            <template #default="{ row }">
              <div class="cell-primary mono-text">{{ row.workOrderNo }}</div>
              <div class="cell-secondary">订单 {{ row.orderNo }}</div>
            </template>
          </el-table-column>
          <el-table-column label="设备" min-width="180">
            <template #default="{ row }">
              <template v-if="row.deviceNo">
                <div class="mono-text">{{ row.deviceNo }}</div>
                <div class="cell-secondary">{{ row.deviceName }}</div>
              </template>
              <span v-else class="muted-text">待排产</span>
            </template>
          </el-table-column>
          <el-table-column label="材料 / 工艺 / 门幅" min-width="210">
            <template #default="{ row }">
              <div>{{ row.materialType }} / {{ row.processType }}</div>
              <div class="cell-secondary">{{ row.fabricWidthMm }}mm · {{ row.plannedMeters }} 米</div>
            </template>
          </el-table-column>
          <el-table-column label="队列" width="120">
            <template #default="{ row }">
              <div v-if="row.queuePosition">第 {{ row.queuePosition }} 位</div>
              <div class="cell-secondary">{{ queueStatusLabel(row.queueStatus) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="计划时间" min-width="210">
            <template #default="{ row }">
              <div>{{ formatDateTime(row.plannedStart) }}</div>
              <div class="cell-secondary">至 {{ formatDateTime(row.plannedEnd) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="实际时间" min-width="210">
            <template #default="{ row }">
              <div>{{ formatDateTime(row.actualStart) }}</div>
              <div class="cell-secondary">至 {{ formatDateTime(row.actualEnd) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="workOrderTagType(row.status)" effect="light">{{ workOrderStatusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="canViewCost" label="材料成本" width="130" align="right">
            <template #default="{ row }">
              <div>{{ row.materialCostAmount == null ? '—' : formatMoney(row.materialCostAmount) }}</div>
              <div class="cell-secondary">领料累计</div>
            </template>
          </el-table-column>
          <el-table-column v-if="canIssueMaterial" label="领料" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openMaterialIssue(row)">领料</el-button>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="180">
            <template #default="{ row }">
              <span v-if="row.remark">{{ row.remark }}</span>
              <span v-else class="muted-text">—</span>
            </template>
          </el-table-column>
          <template #empty>
            <EmptyState title="暂无生产工单" description="排产人员可在排产队列页面按订单创建工单。" />
          </template>
        </el-table>
      </section>

      <section class="panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">ORDER LIFECYCLE</span>
            <h2>订单流程</h2>
          </div>
          <span class="panel__meta">实线为基础版已实现，后续节点为规划</span>
        </div>
        <el-steps :active="activeStep" finish-status="success" align-center class="order-steps">
          <el-step v-for="step in flowSteps" :key="step.title" :title="step.title" :description="step.description" />
        </el-steps>
        <el-alert type="info" :closable="false" show-icon class="section-alert" title="流程说明">
          <template #default>
            当前基础版已实现订单创建、合同关联、信用校验、同工厂工单排产、FIFO 队列和开始/完成生产。
            发货、回款和审批中心将在对应模块完成后接入，届时本页会展示完整关联单据。
          </template>
        </el-alert>
      </section>
    </template>

    <el-skeleton v-else-if="loading" :rows="8" animated class="panel detail-skeleton" />
  </div>
</template>
