<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Close,
  Cpu,
  Plus,
  Refresh,
  Search,
  Sort,
  VideoPlay,
  Warning,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  assignWorkOrder,
  cancelWorkOrder,
  completeWorkOrder,
  createJumpRequest,
  createWorkOrder,
  fetchDeviceOptions,
  fetchProductionBoard,
  fetchWorkOrderPage,
  startWorkOrder,
} from '@/api/production'
import { fetchOrderPage } from '@/api/order'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import {
  DEVICE_STATUS,
  QUEUE_STATUS,
  WORK_ORDER_STATUS,
  deviceStatusLabel,
  workOrderStatusLabel,
} from '@/constants'

/**
 * 设备排产与 FIFO 队列看板。
 *
 * 排产规则：订单先按材料/工艺/长度拆成工单，每个工单只能选择同工厂设备；
 * 一台设备同一时间只执行一个工单，超出产能按队列序号 FIFO 等待。急单插队
 * 必须由销售发起申请、厂长审批，审批通过后才重排队列。
 */
const auth = useAuthStore()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const board = ref({
  factoryId: null,
  devices: [],
  summary: {
    deviceCount: 0,
    idleCount: 0,
    runningCount: 0,
    maintenanceCount: 0,
    faultCount: 0,
    queuedCount: 0,
    runningWorkOrderCount: 0,
    pendingJumpCount: 0,
  },
})
const factories = ref([])
const selectedFactory = ref('')

const pendingLoading = ref(false)
const pendingOrders = ref([])

const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createFormRef = ref()
const orderOptions = ref([])
const orderLoading = ref(false)
const orderKeyword = ref('')
const deviceOptions = ref([])
const deviceLoading = ref(false)

const assignVisible = ref(false)
const assignSaving = ref(false)
const assignError = ref('')
const assignTarget = ref(null)
const assignDeviceId = ref('')
const assignDevices = ref([])
const assignLoading = ref(false)

const jumpVisible = ref(false)
const jumpSaving = ref(false)
const jumpError = ref('')
const jumpTarget = ref(null)
const jumpFormRef = ref()
const jumpForm = reactive({
  targetPosition: 1,
  reason: '',
})

const createForm = reactive({
  orderNo: '',
  deviceId: '',
  materialType: '',
  processType: '',
  fabricWidthMm: null,
  plannedMeters: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('production:schedule:write'))
const canApplyJump = computed(() => auth.hasPermission('production:queue:jump:apply'))
const canIssueMaterial = computed(() => auth.hasPermission('warehouse:outbound'))
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

const selectedOrder = computed(() =>
  orderOptions.value.find((item) => String(item.orderNo) === String(createForm.orderNo)),
)

const createRules = {
  orderNo: [{ required: true, message: '请选择订单', trigger: 'change' }],
  materialType: [{ required: true, message: '请输入材料', trigger: 'blur' }],
  processType: [{ required: true, message: '请输入工艺', trigger: 'blur' }],
  fabricWidthMm: [
    { required: true, message: '请输入门幅', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (Number(value) <= 0) callback(new Error('门幅必须大于 0'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
  plannedMeters: [
    { required: true, message: '请输入计划长度', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const number = Number(value)
        if (Number.isNaN(number) || number <= 0) callback(new Error('计划长度必须大于 0'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

const jumpRules = {
  targetPosition: [
    { required: true, message: '请输入目标位置', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (Number(value) < 1) {
          callback(new Error('目标位置从 1 开始'))
          return
        }
        if (jumpTarget.value && Number(value) >= Number(jumpTarget.value.position)) {
          callback(new Error('目标位置必须早于当前位置'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  reason: [{ required: true, message: '请填写插队原因', trigger: 'blur' }],
}

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function deviceTagType(status) {
  return DEVICE_STATUS[status]?.type || 'info'
}

function workOrderTagType(status) {
  return WORK_ORDER_STATUS[status]?.type || 'info'
}

function queueTagType(status) {
  return QUEUE_STATUS[status]?.type || 'info'
}

function canStart(entry, device) {
  return canWrite.value
    && entry.workOrderStatus === 'QUEUED'
    && entry.queueStatus === 'WAITING'
    && entry.position === 1
    && ['IDLE', 'RUNNING'].includes(device.status)
    && !device.currentWorkOrderId
}

function canComplete(entry) {
  return canWrite.value && entry.workOrderStatus === 'RUNNING'
}

function canCancel(entry) {
  return canWrite.value && entry.workOrderStatus === 'QUEUED' && entry.queueStatus === 'WAITING'
}

function canJump(entry, device) {
  if (!canApplyJump.value || entry.workOrderStatus !== 'QUEUED' || entry.queueStatus !== 'WAITING') {
    return false
  }
  const earliest = device.currentWorkOrderId ? 2 : 1
  return entry.position > earliest
}

function earliestJumpPosition(device) {
  return device?.currentWorkOrderId ? 2 : 1
}

async function loadFactories() {
  if (!auth.hasPermission('system:factory:list')) return
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
}

async function loadBoard() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchProductionBoard(selectedFactory.value || undefined)
    board.value = {
      factoryId: data.factoryId,
      devices: data.devices || [],
      summary: data.summary || board.value.summary,
    }
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadPending() {
  if (!canWrite.value) {
    pendingOrders.value = []
    return
  }
  pendingLoading.value = true
  try {
    const data = await fetchWorkOrderPage({ page: 1, size: 50, status: 'PENDING' })
    pendingOrders.value = data.records || []
  } catch {
    pendingOrders.value = []
  } finally {
    pendingLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadBoard(), loadPending()])
}

/**
 * 载入可排产订单。
 *
 * 默认只取最近 100 张订单（size 上限 100）；订单较多时用订单号精确查询，
 * 后端按订单号分片路由，查询结果不会漏数据。
 */
async function loadOrderOptions(keyword = '') {
  orderLoading.value = true
  try {
    const params = { page: 1, size: 100 }
    const trimmed = String(keyword || '').trim()
    if (trimmed) params.orderNo = trimmed
    const data = await fetchOrderPage(params)
    orderOptions.value = (data.records || []).filter((item) =>
      ['CREATED', 'QUEUED', 'IN_PRODUCTION'].includes(item.orderStatus),
    )
  } catch (error) {
    ElMessage.error(errorMessage(error))
    orderOptions.value = []
  } finally {
    orderLoading.value = false
  }
}

async function loadCreateDevices(factoryId) {
  deviceOptions.value = []
  if (!factoryId) return
  deviceLoading.value = true
  try {
    const data = await fetchDeviceOptions(factoryId)
    deviceOptions.value = (data || []).filter((item) => ['IDLE', 'RUNNING'].includes(item.status))
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    deviceLoading.value = false
  }
}

async function openCreate() {
  Object.assign(createForm, {
    orderNo: '',
    deviceId: '',
    materialType: '',
    processType: '',
    fabricWidthMm: null,
    plannedMeters: '',
    remark: '',
  })
  orderKeyword.value = ''
  createError.value = ''
  createVisible.value = true
  await loadOrderOptions()
}

/** 按订单号查询可排产订单，替代默认的最近 100 张。 */
async function searchOrders() {
  createForm.orderNo = ''
  createForm.deviceId = ''
  deviceOptions.value = []
  await loadOrderOptions(orderKeyword.value)
}

async function handleOrderChange(orderNo) {
  createForm.deviceId = ''
  deviceOptions.value = []
  const order = orderOptions.value.find((item) => String(item.orderNo) === String(orderNo))
  if (order) {
    await loadCreateDevices(order.factoryId)
  }
}

async function submitCreate() {
  createError.value = ''
  try {
    await createFormRef.value.validate()
  } catch {
    return
  }
  createSaving.value = true
  try {
    await createWorkOrder({
      orderNo: createForm.orderNo,
      deviceId: createForm.deviceId || null,
      materialType: createForm.materialType.trim(),
      processType: createForm.processType.trim(),
      fabricWidthMm: Number(createForm.fabricWidthMm),
      plannedMeters: String(createForm.plannedMeters),
      remark: createForm.remark.trim() || null,
    })
    ElMessage.success(createForm.deviceId ? '工单已创建并进入设备队列' : '工单已创建，等待分配设备')
    createVisible.value = false
    await refreshAll()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function openAssign(row) {
  assignTarget.value = row
  assignDeviceId.value = ''
  assignDevices.value = []
  assignError.value = ''
  assignVisible.value = true
  assignLoading.value = true
  try {
    const data = await fetchDeviceOptions(row.factoryId)
    assignDevices.value = (data || []).filter((item) => ['IDLE', 'RUNNING'].includes(item.status))
  } catch (error) {
    assignError.value = errorMessage(error)
  } finally {
    assignLoading.value = false
  }
}

async function submitAssign() {
  if (!assignDeviceId.value) {
    assignError.value = '请选择同工厂设备'
    return
  }
  assignSaving.value = true
  assignError.value = ''
  try {
    await assignWorkOrder(assignTarget.value.id, assignDeviceId.value)
    ElMessage.success('工单已进入设备队列')
    assignVisible.value = false
    await refreshAll()
  } catch (error) {
    assignError.value = errorMessage(error)
  } finally {
    assignSaving.value = false
  }
}

async function handleStart(row) {
  try {
    await ElMessageBox.confirm(
      `确认开始工单 ${row.workOrderNo}？设备将进入生产状态。`,
      '开始生产',
      { confirmButtonText: '开始', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await startWorkOrder(row.workOrderId)
    ElMessage.success('工单已开始')
    await refreshAll()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleComplete(row) {
  try {
    await ElMessageBox.confirm(
      `确认完成工单 ${row.workOrderNo}？完成后设备释放并顺延队列。`,
      '完成工单',
      { confirmButtonText: '确认完成', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await completeWorkOrder(row.workOrderId)
    ElMessage.success('工单已完成')
    await refreshAll()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(
      `确认取消排队工单 ${row.workOrderNo}？取消后不可恢复。`,
      '取消工单',
      { confirmButtonText: '取消工单', cancelButtonText: '返回', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await cancelWorkOrder(row.workOrderId)
    ElMessage.success('工单已取消')
    await refreshAll()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openJump(entry, device) {
  jumpTarget.value = { ...entry, device }
  const earliest = earliestJumpPosition(device)
  const preferred = Math.max(earliest, 1)
  jumpForm.targetPosition = preferred < entry.position ? preferred : entry.position - 1
  jumpForm.reason = ''
  jumpError.value = ''
  jumpVisible.value = true
}

async function submitJump() {
  jumpError.value = ''
  try {
    await jumpFormRef.value.validate()
  } catch {
    return
  }
  jumpSaving.value = true
  try {
    await createJumpRequest(jumpTarget.value.workOrderId, {
      targetPosition: Number(jumpForm.targetPosition),
      reason: jumpForm.reason.trim(),
    })
    ElMessage.success('插队申请已提交审批，等待厂长审批')
    jumpVisible.value = false
    await refreshAll()
  } catch (error) {
    jumpError.value = errorMessage(error)
  } finally {
    jumpSaving.value = false
  }
}

function openOrder(orderNo) {
  if (orderNo) router.push(`/orders/${orderNo}`)
}

/** 跳转到领料页并按工单过滤，便于现场直接登记领料。 */
function openMaterialIssue(entry) {
  router.push({ path: '/warehouse/material-issues', query: { workOrderId: entry.workOrderId } })
}

onMounted(async () => {
  if (isFactoryManager.value && auth.factoryId) {
    selectedFactory.value = String(auth.factoryId)
  }
  await loadFactories()
  await refreshAll()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="PRODUCTION · SCHEDULE"
      title="排产队列"
      description="按设备查看当前生产与等待队列；订单只能在单工厂内拆分，超出产能按 FIFO 排队。"
    >
      <template #actions>
        <el-button :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建工单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="排产规则">
      <template #default>
        每台设备同一时间只执行一个工单，等待工单按进入队列顺序执行；急单插队必须由销售发起申请、厂长审批，
        审批通过后重排队列并通知被顺延业务员。生产中工单不可被抢占，设备保养/故障只暂停后续排队。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Cpu /></el-icon></div>
        <div>
          <span class="metric-card__label">设备总数</span>
          <strong class="metric-card__value">{{ board.summary.deviceCount }}</strong>
          <span class="metric-card__hint">空闲 {{ board.summary.idleCount }} · 生产中 {{ board.summary.runningCount }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber"><el-icon><Sort /></el-icon></div>
        <div>
          <span class="metric-card__label">等待工单</span>
          <strong class="metric-card__value">{{ board.summary.queuedCount }}</strong>
          <span class="metric-card__hint">按 FIFO 顺序执行</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><VideoPlay /></el-icon></div>
        <div>
          <span class="metric-card__label">生产中工单</span>
          <strong class="metric-card__value">{{ board.summary.runningWorkOrderCount }}</strong>
          <span class="metric-card__hint">一设备一工单</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--red"><el-icon><Warning /></el-icon></div>
        <div>
          <span class="metric-card__label">异常 / 待审批</span>
          <strong class="metric-card__value">
            {{ Number(board.summary.maintenanceCount) + Number(board.summary.faultCount) + Number(board.summary.pendingJumpCount) }}
          </strong>
          <span class="metric-card__hint">保养 {{ board.summary.maintenanceCount }} · 故障 {{ board.summary.faultCount }} · 插队 {{ board.summary.pendingJumpCount }}</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form class="filter-form" label-position="top" @submit.prevent="loadBoard">
        <el-form-item label="工厂">
          <el-select v-model="selectedFactory" placeholder="全部工厂" clearable @change="loadBoard">
            <el-option v-for="factory in visibleFactories" :key="factory.id" :label="factory.name" :value="String(factory.id)" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询队列
          </el-button>
          <el-button @click="refreshAll">刷新全部</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>队列位置从 1 开始；生产中工单占用队首，插队只能调整等待中的工单。</span>
        <span>销售只能看到自己订单对应的队列记录。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="board-grid" v-loading="loading">
      <article v-for="item in board.devices" :key="item.device.id" class="panel device-board">
        <header class="device-board__head">
          <div>
            <div class="device-board__title">
              <span class="mono-text">{{ item.device.deviceNo }}</span>
              <el-tag :type="deviceTagType(item.device.status)" effect="light">{{ deviceStatusLabel(item.device.status) }}</el-tag>
            </div>
            <div class="device-board__meta">
              {{ item.device.deviceName }} · {{ factoryName(item.device.factoryId) }}
              <span v-if="item.device.workshop">· {{ item.device.workshop }}</span>
            </div>
          </div>
          <div class="device-board__stats">
            <span>产能 {{ item.device.capacityMetersPerHour }} 米/小时</span>
            <span>队列 {{ item.entries.length }} 条</span>
            <span v-if="item.device.nextFreeAt">预计空闲 {{ formatDateTime(item.device.nextFreeAt) }}</span>
          </div>
        </header>

        <div v-if="item.entries.length" class="queue-list">
          <div v-for="entry in item.entries" :key="entry.queueId" class="queue-row">
            <div class="queue-position">
              <strong>{{ entry.position }}</strong>
              <span>位</span>
            </div>
            <div class="queue-main">
              <div class="queue-main__top">
                <el-button link type="primary" class="mono-text" @click="openOrder(entry.orderNo)">
                  {{ entry.workOrderNo }}
                </el-button>
                <el-tag :type="queueTagType(entry.queueStatus)" size="small" effect="plain">
                  {{ QUEUE_STATUS[entry.queueStatus]?.label || entry.queueStatus }}
                </el-tag>
                <el-tag v-if="entry.jumped" type="danger" size="small" effect="plain">已插队</el-tag>
                <el-tag :type="workOrderTagType(entry.workOrderStatus)" size="small" effect="plain">
                  {{ workOrderStatusLabel(entry.workOrderStatus) }}
                </el-tag>
              </div>
              <div class="queue-main__meta">
                订单 <span class="mono-text">{{ entry.orderNo }}</span> · 客户 #{{ entry.customerId }}
                · {{ entry.materialType }} / {{ entry.processType }} · {{ entry.fabricWidthMm }}mm
                · {{ entry.plannedMeters }} 米
              </div>
              <div class="queue-main__time">
                计划 {{ formatDateTime(entry.plannedStart) }} → {{ formatDateTime(entry.plannedEnd) }}
                <span v-if="entry.jumpReason">· 插队原因：{{ entry.jumpReason }}</span>
              </div>
            </div>
            <div class="queue-actions">
              <el-button v-if="canStart(entry, item.device)" size="small" type="primary" @click="handleStart(entry)">
                <el-icon><VideoPlay /></el-icon>开始
              </el-button>
              <el-button v-if="canComplete(entry)" size="small" type="success" @click="handleComplete(entry)">
                <el-icon><CircleCheck /></el-icon>完成
              </el-button>
              <el-button v-if="canJump(entry, item.device)" size="small" type="warning" plain @click="openJump(entry, item.device)">
                <el-icon><Sort /></el-icon>申请插队
              </el-button>
              <el-button v-if="canCancel(entry)" size="small" type="danger" plain @click="handleCancel(entry)">
                <el-icon><Close /></el-icon>取消
              </el-button>
              <el-button
                v-if="canIssueMaterial && entry.workOrderStatus !== 'COMPLETED'"
                size="small"
                type="primary"
                plain
                @click="openMaterialIssue(entry)"
              >
                领料
              </el-button>
            </div>
          </div>
        </div>
        <div v-else class="device-board__empty">
          <EmptyState
            :title="item.device.status === 'IDLE' ? '设备空闲' : '暂无等待队列'"
            description="该设备当前没有生产中或等待中的工单。"
          />
        </div>
      </article>

      <div v-if="!loading && !board.devices.length" class="panel">
        <EmptyState title="暂无设备队列" description="当前筛选条件下没有可排产设备，请检查工厂筛选或设备台账。" />
      </div>
    </section>

    <section v-if="canWrite" class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">PENDING WORK ORDERS</span>
          <h2>待排产工单</h2>
        </div>
        <span class="table-panel__meta">创建时未指定设备的工单在此分配</span>
      </div>
      <el-table v-loading="pendingLoading" :data="pendingOrders" class="data-table" row-key="id">
        <el-table-column label="工单号" min-width="190">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.workOrderNo }}</div>
            <div class="cell-secondary">订单 {{ row.orderNo }} · 客户 #{{ row.customerId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工厂" min-width="140">
          <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
        </el-table-column>
        <el-table-column label="材料 / 工艺 / 门幅" min-width="220">
          <template #default="{ row }">
            <div>{{ row.materialType }} / {{ row.processType }}</div>
            <div class="cell-secondary">{{ row.fabricWidthMm }}mm · {{ row.plannedMeters }} 米</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="workOrderTagType(row.status)" effect="light">{{ workOrderStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openAssign(row)">分配设备</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="没有待排产工单" description="新建工单时选择设备即可直接进入队列。" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="createVisible" title="新建生产工单" width="720px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="订单" prop="orderNo" class="form-grid__full">
            <div class="order-search">
              <el-input
                v-model="orderKeyword"
                placeholder="按订单号查询（默认加载最近 100 张可排产订单）"
                clearable
                @keyup.enter="searchOrders"
              />
              <el-button :loading="orderLoading" @click="searchOrders">
                <el-icon><Search /></el-icon>查询
              </el-button>
            </div>
            <el-select
              v-model="createForm.orderNo"
              :loading="orderLoading"
              filterable
              placeholder="选择可排产订单（已创建/排队中/生产中）"
              @change="handleOrderChange"
            >
              <el-option
                v-for="order in orderOptions"
                :key="order.orderNo"
                :label="`订单 ${order.orderNo} · 客户 #${order.customerId} · ${factoryName(order.factoryId)} · ${order.orderStatus}`"
                :value="String(order.orderNo)"
              />
            </el-select>
            <template #extra>
              <span class="field-hint">订单只能选择所属工厂内的设备，不能跨厂排产。</span>
            </template>
          </el-form-item>
          <el-form-item label="初始设备（可选）">
            <el-select
              v-model="createForm.deviceId"
              :disabled="!createForm.orderNo"
              :loading="deviceLoading"
              clearable
              placeholder="留空则进入待排产"
            >
              <el-option
                v-for="device in deviceOptions"
                :key="device.id"
                :label="`${device.deviceNo} · ${device.deviceName} · ${deviceStatusLabel(device.status)}`"
                :value="String(device.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="材料 / 布料" prop="materialType">
            <el-input v-model="createForm.materialType" placeholder="例如 COTTON" maxlength="64" />
          </el-form-item>
          <el-form-item label="工艺 / 染料" prop="processType">
            <el-input v-model="createForm.processType" placeholder="例如 PRINT" maxlength="64" />
          </el-form-item>
          <el-form-item label="门幅（mm）" prop="fabricWidthMm">
            <el-input-number v-model="createForm.fabricWidthMm" :min="1" :controls="false" style="width: 100%" placeholder="例如 1500" />
          </el-form-item>
          <el-form-item label="计划长度（米）" prop="plannedMeters">
            <el-input v-model="createForm.plannedMeters" placeholder="例如 100.00" inputmode="decimal" />
            <template #extra><span class="field-hint">保留两位小数，超出直接截去。</span></template>
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <el-alert v-if="selectedOrder" type="info" :closable="false" show-icon>
          <template #default>
            订单所属工厂：{{ factoryName(selectedOrder.factoryId) }}。设备必须同工厂且满足材料、工艺和门幅要求，
            不符合时后端会拒绝入队。
          </template>
        </el-alert>
        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>创建工单
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="assignVisible" title="分配设备" width="520px" destroy-on-close>
      <el-alert v-if="assignError" type="error" :title="assignError" :closable="false" show-icon class="section-alert" />
      <p v-if="assignTarget" class="dialog-lead">
        工单 <span class="mono-text">{{ assignTarget.workOrderNo }}</span> · 订单
        <span class="mono-text">{{ assignTarget.orderNo }}</span> · {{ factoryName(assignTarget.factoryId) }}
      </p>
      <el-form label-position="top">
        <el-form-item label="同工厂设备">
          <el-select v-model="assignDeviceId" :loading="assignLoading" filterable placeholder="选择空闲或生产中设备">
            <el-option
              v-for="device in assignDevices"
              :key="device.id"
              :label="`${device.deviceNo} · ${device.deviceName} · ${deviceStatusLabel(device.status)}`"
              :value="String(device.id)"
            />
          </el-select>
          <template #extra><span class="field-hint">分配后立即进入该设备队尾并计算预计时间。</span></template>
        </el-form-item>
      </el-form>
      <div class="form-actions">
        <el-button type="primary" :loading="assignSaving" @click="submitAssign">确认分配</el-button>
        <el-button @click="assignVisible = false">取消</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="jumpVisible" title="申请设备队列插队" width="560px" destroy-on-close>
      <el-alert v-if="jumpError" type="error" :title="jumpError" :closable="false" show-icon class="section-alert" />
      <template v-if="jumpTarget">
        <p class="dialog-lead">
          工单 <span class="mono-text">{{ jumpTarget.workOrderNo }}</span> ·
          设备 <span class="mono-text">{{ jumpTarget.device.deviceNo }}</span> ·
          当前第 {{ jumpTarget.position }} 位
        </p>
        <el-form ref="jumpFormRef" :model="jumpForm" :rules="jumpRules" label-position="top">
          <el-form-item label="目标位置" prop="targetPosition">
            <el-input-number
              v-model="jumpForm.targetPosition"
              :min="earliestJumpPosition(jumpTarget.device)"
              :max="Math.max(1, jumpTarget.position - 1)"
              style="width: 100%"
            />
            <template #extra>
              <span class="field-hint">
                设备正在生产时最早只能排到第 {{ earliestJumpPosition(jumpTarget.device) }} 位，生产中工单不可抢占。
              </span>
            </template>
          </el-form-item>
          <el-form-item label="插队原因" prop="reason">
            <el-input v-model="jumpForm.reason" type="textarea" :rows="3" maxlength="500" placeholder="请说明急单原因，审批和通知会引用" />
          </el-form-item>
        </el-form>
        <el-alert type="warning" :closable="false" show-icon title="影响说明">
          <template #default>
            提交后需厂长审批；通过后被顺延工单的业务员会收到站内消息，系统不做经济补偿。
          </template>
        </el-alert>
      </template>
      <div class="form-actions">
        <el-button type="primary" :loading="jumpSaving" @click="submitJump">提交申请</el-button>
        <el-button @click="jumpVisible = false">取消</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.board-grid {
  display: grid;
  gap: 16px;
}

.device-board {
  padding: 18px 20px;
}

.device-board__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.device-board__title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-900);
  font-size: 15px;
  font-weight: 700;
}

.device-board__meta {
  margin-top: 4px;
  color: var(--ink-400);
  font-size: 11px;
}

.device-board__stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px 14px;
  color: var(--ink-400);
  font-size: 10.5px;
}

.device-board__empty {
  padding: 10px 0 0;
}

.queue-list {
  display: grid;
  gap: 8px;
  padding-top: 12px;
}

.queue-row {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfcfe;
}

.queue-position {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #eef4ff;
  color: #1d4ed8;
}

.queue-position strong {
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1;
}

.queue-position span {
  font-size: 9px;
}

.queue-main {
  min-width: 0;
}

.queue-main__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.queue-main__meta,
.queue-main__time {
  margin-top: 3px;
  color: var(--ink-500);
  font-size: 10.5px;
  line-height: 1.5;
}

.queue-main__time {
  color: var(--ink-400);
}

.queue-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}

.dialog-lead {
  margin: 0 0 14px;
  color: var(--ink-600);
  font-size: 12px;
}

.order-search {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

@media (max-width: 1100px) {
  .queue-row {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .queue-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}
</style>
