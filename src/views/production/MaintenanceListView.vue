<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Close, Plus, Refresh, Search, Tools, VideoPlay } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  cancelMaintenanceOrder,
  completeMaintenanceOrder,
  createMaintenanceOrder,
  fetchDeviceOptions,
  fetchMaintenanceOrderPage,
  startMaintenanceOrder,
} from '@/api/production'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney, yuanToCents } from '@/utils/money'
import {
  MAINTENANCE_PRIORITY,
  MAINTENANCE_PRIORITY_OPTIONS,
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_OPTIONS,
  MAINTENANCE_TYPE,
  MAINTENANCE_TYPE_OPTIONS,
  maintenanceStatusLabel,
  maintenanceTypeLabel,
} from '@/constants'

/**
 * 设备维护工单（V1.4 设备管理）。
 *
 * 维护工单是设备停机保养的业务凭据：新建不影响排产，开始维护时设备转为保养
 * 或故障状态、等待队列保留并通知受影响业务员，完成后设备恢复空闲并重算队列
 * 计划时间。维护费用全部由公司承担，只做成本记录，不向客户收取，也不计算
 * 设备使用费。
 */
const auth = useAuthStore()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const factories = ref([])
const devices = ref([])
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: {
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
    costAmountTotal: 0,
  },
})

const filters = reactive({
  keyword: '',
  factoryId: '',
  deviceId: '',
  status: '',
  type: '',
  page: 1,
  size: 10,
})

const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createFormRef = ref()
const createForm = reactive({
  deviceId: '',
  maintenanceType: 'PREVENTIVE',
  priority: 'NORMAL',
  title: '',
  description: '',
  plannedStart: '',
  plannedEnd: '',
  remark: '',
})

const completeVisible = ref(false)
const completeSaving = ref(false)
const completeError = ref('')
const completeFormRef = ref()
const completeTarget = ref(null)
const completeForm = reactive({
  costYuan: '0.00',
  costNote: '',
  downtimeMinutes: 0,
})

const canWrite = computed(() => auth.hasPermission('equipment:maintenance:write'))
const hasFilters = computed(
  () => Boolean(filters.keyword || filters.factoryId || filters.deviceId || filters.status || filters.type),
)
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

const visibleDevices = computed(() => {
  if (!filters.factoryId) return devices.value
  return devices.value.filter((item) => String(item.factoryId) === String(filters.factoryId))
})

// 厂长只能维护本厂设备，下拉只提供本厂设备，避免提交后被服务端拒绝。
const maintainableDevices = computed(() => {
  if (!isFactoryManager.value) return devices.value
  return devices.value.filter((item) => String(item.factoryId) === String(auth.factoryId))
})

const createRules = {
  deviceId: [{ required: true, message: '请选择设备', trigger: 'change' }],
  title: [{ required: true, message: '请输入维护主题', trigger: 'blur' }],
  plannedEnd: [
    {
      validator: (_rule, value, callback) => {
        if (value && createForm.plannedStart && value < createForm.plannedStart) {
          callback(new Error('计划结束时间不能早于计划开始时间'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const completeRules = {
  costYuan: [
    { required: true, message: '请输入维护成本', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!/^\d+(\.\d*)?$/.test(String(value).trim())) {
          callback(new Error('金额格式不正确'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function deviceName(deviceId) {
  const match = devices.value.find((item) => String(item.id) === String(deviceId))
  return match?.deviceName || (deviceId ? `设备 #${deviceId}` : '—')
}

function statusTagType(value) {
  return MAINTENANCE_STATUS[value]?.type || 'info'
}

function typeTagType(value) {
  return MAINTENANCE_TYPE[value]?.type || 'info'
}

function priorityTagType(value) {
  return MAINTENANCE_PRIORITY[value]?.type || 'info'
}

function canStart(row) {
  return canWrite.value && row.status === 'PENDING'
}

function canComplete(row) {
  return canWrite.value && row.status === 'IN_PROGRESS'
}

function canCancel(row) {
  return canWrite.value && row.status === 'PENDING'
}

async function loadFactories() {
  if (!auth.hasPermission('system:factory:list')) return
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
}

async function loadDevices() {
  try {
    devices.value = (await fetchDeviceOptions()) || []
  } catch {
    devices.value = []
  }
}

async function loadOrders() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.factoryId) params.factoryId = filters.factoryId
    if (filters.deviceId) params.deviceId = filters.deviceId
    if (filters.status) params.status = filters.status
    if (filters.type) params.type = filters.type
    const data = await fetchMaintenanceOrderPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
      summary: data.summary || pageData.value.summary,
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { ...pageData.value, records: [], total: 0 }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadOrders()
}

function resetFilters() {
  filters.keyword = ''
  filters.factoryId = ''
  filters.deviceId = ''
  filters.status = ''
  filters.type = ''
  filters.page = 1
  loadOrders()
}

function openCreate() {
  Object.assign(createForm, {
    deviceId: '',
    maintenanceType: 'PREVENTIVE',
    priority: 'NORMAL',
    title: '',
    description: '',
    plannedStart: '',
    plannedEnd: '',
    remark: '',
  })
  createError.value = ''
  createVisible.value = true
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
    await createMaintenanceOrder({
      deviceId: createForm.deviceId,
      maintenanceType: createForm.maintenanceType,
      priority: createForm.priority,
      title: createForm.title.trim(),
      description: createForm.description.trim() || null,
      plannedStart: createForm.plannedStart || null,
      plannedEnd: createForm.plannedEnd || null,
      remark: createForm.remark.trim() || null,
    })
    ElMessage.success('维护工单已创建')
    createVisible.value = false
    await loadOrders()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function handleStart(row) {
  try {
    await ElMessageBox.confirm(
      `确认开始维护 ${row.deviceNo}？设备将转为${row.maintenanceType === 'REPAIR' ? '故障维修' : '保养'}状态，等待队列保留。`,
      '开始维护',
      { confirmButtonText: '开始维护', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await startMaintenanceOrder(row.id)
    ElMessage.success('维护已开始，设备已停机')
    await loadOrders()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openComplete(row) {
  completeTarget.value = row
  completeForm.costYuan = '0.00'
  completeForm.costNote = ''
  completeForm.downtimeMinutes = 0
  completeError.value = ''
  completeVisible.value = true
}

async function submitComplete() {
  completeError.value = ''
  try {
    await completeFormRef.value.validate()
  } catch {
    return
  }
  completeSaving.value = true
  try {
    await completeMaintenanceOrder(completeTarget.value.id, {
      costAmount: yuanToCents(completeForm.costYuan),
      costNote: completeForm.costNote.trim() || null,
      downtimeMinutes: Number(completeForm.downtimeMinutes || 0),
    })
    ElMessage.success('维护已完成，设备恢复空闲')
    completeVisible.value = false
    await loadOrders()
  } catch (error) {
    completeError.value = errorMessage(error)
  } finally {
    completeSaving.value = false
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(`确认取消维护工单 ${row.maintenanceNo}？`, '取消维护工单', {
      confirmButtonText: '取消工单',
      cancelButtonText: '返回',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await cancelMaintenanceOrder(row.id)
    ElMessage.success('维护工单已取消')
    await loadOrders()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openDevice(deviceId) {
  if (deviceId) router.push(`/equipment?deviceId=${deviceId}`)
}

onMounted(async () => {
  await Promise.all([loadFactories(), loadDevices()])
  await loadOrders()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="EQUIPMENT · MAINTENANCE"
      title="维护工单"
      description="登记设备保养与维修工单；开始维护时设备停机、等待队列保留，完成后恢复并重算计划时间。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadOrders">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建维护工单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="维护口径">
      <template #default>
        维护费用全部由公司承担，只做成本记录，不向客户收取，也不计算设备使用费；生产中的设备必须先完成当前工单才能停机。
        停机期间等待队列保留，受影响业务员会收到交期风险消息，恢复后队列计划时间重新计算。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Tools /></el-icon></div>
        <div>
          <span class="metric-card__label">维护工单</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.total).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">待处理 {{ pageData.summary.pending }} · 执行中 {{ pageData.summary.inProgress }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><CircleCheck /></el-icon></div>
        <div>
          <span class="metric-card__label">已完成</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.completed).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">已取消 {{ pageData.summary.cancelled }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber"><el-icon><Tools /></el-icon></div>
        <div>
          <span class="metric-card__label">维护成本合计</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.costAmountTotal) }}</strong>
          <span class="metric-card__hint">公司承担，不计入客户应收</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="维护单号、设备编号或主题"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="工厂">
          <el-select v-model="filters.factoryId" placeholder="全部工厂" clearable @change="filters.deviceId = ''">
            <el-option
              v-for="factory in visibleFactories"
              :key="factory.id"
              :label="factory.name"
              :value="String(factory.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="设备">
          <el-select v-model="filters.deviceId" placeholder="全部设备" clearable filterable>
            <el-option
              v-for="device in visibleDevices"
              :key="device.id"
              :label="`${device.deviceNo} · ${device.deviceName}`"
              :value="String(device.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in MAINTENANCE_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部类型" clearable>
            <el-option v-for="item in MAINTENANCE_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <span>汇总指标按当前筛选条件统计，不受分页限制。</span>
        <span>销售与财务可只读查看维护情况，用于判断交期与成本。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">MAINTENANCE ORDERS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张维护工单</h2>
        </div>
        <span class="table-panel__meta">成本单位：元（后端按分存储）</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="维护单号 / 设备" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.maintenanceNo }}</div>
            <div class="cell-secondary">
              <el-button link type="primary" class="cell-link" @click="openDevice(row.deviceId)">
                {{ row.deviceNo }}
              </el-button>
              · {{ row.deviceName || deviceName(row.deviceId) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="工厂" min-width="120">
          <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
        </el-table-column>
        <el-table-column label="类型 / 优先级" width="150">
          <template #default="{ row }">
            <el-tag :type="typeTagType(row.maintenanceType)" size="small" effect="plain">
              {{ maintenanceTypeLabel(row.maintenanceType) }}
            </el-tag>
            <el-tag :type="priorityTagType(row.priority)" size="small" effect="plain" class="cell-second-tag">
              {{ MAINTENANCE_PRIORITY[row.priority]?.label || row.priority }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="维护主题" min-width="220">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.title }}</div>
            <div v-if="row.description" class="cell-secondary">{{ row.description }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ maintenanceStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" min-width="200">
          <template #default="{ row }">
            <div>开始 {{ formatDateTime(row.actualStart) }}</div>
            <div class="cell-secondary">结束 {{ formatDateTime(row.actualEnd) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="停机时长" width="100" align="right">
          <template #default="{ row }">{{ row.downtimeMinutes ?? 0 }} 分钟</template>
        </el-table-column>
        <el-table-column label="维护成本" width="120" align="right">
          <template #default="{ row }">
            <div>{{ formatMoney(row.costAmount) }}</div>
            <div v-if="row.costNote" class="cell-secondary">{{ row.costNote }}</div>
          </template>
        </el-table-column>
        <el-table-column label="执行人" width="100">
          <template #default="{ row }">{{ row.handlerName || '—' }}</template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button v-if="canStart(row)" link type="primary" @click="handleStart(row)">
              <el-icon><VideoPlay /></el-icon>开始
            </el-button>
            <el-button v-if="canComplete(row)" link type="success" @click="openComplete(row)">
              <el-icon><CircleCheck /></el-icon>完成
            </el-button>
            <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">
              <el-icon><Close /></el-icon>取消
            </el-button>
            <span v-if="!canStart(row) && !canComplete(row) && !canCancel(row)" class="muted-text">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无维护工单" description="设备管理员可新建维护工单，登记保养或维修任务。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadOrders() }"
          @current-change="(page) => { filters.page = page; loadOrders() }"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建维护工单" width="720px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="设备" prop="deviceId">
            <el-select v-model="createForm.deviceId" filterable placeholder="选择需要维护的设备">
              <el-option
                v-for="device in maintainableDevices"
                :key="device.id"
                :label="`${device.deviceNo} · ${device.deviceName} · ${factoryName(device.factoryId)}`"
                :value="String(device.id)"
              />
            </el-select>
            <template #extra><span class="field-hint">新建不影响排产；开始维护时设备才会停机。</span></template>
          </el-form-item>
          <el-form-item label="维护类型">
            <el-select v-model="createForm.maintenanceType">
              <el-option v-for="item in MAINTENANCE_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <template #extra><span class="field-hint">故障维修开始后设备转为“故障维修”，其余转为“保养中”。</span></template>
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="createForm.priority">
              <el-option v-for="item in MAINTENANCE_PRIORITY_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="维护主题" prop="title">
            <el-input v-model="createForm.title" placeholder="例如 季度保养与精度校准" maxlength="200" />
          </el-form-item>
          <el-form-item label="计划开始">
            <el-input v-model="createForm.plannedStart" type="datetime-local" />
          </el-form-item>
          <el-form-item label="计划结束" prop="plannedEnd">
            <el-input v-model="createForm.plannedEnd" type="datetime-local" />
          </el-form-item>
          <el-form-item label="问题描述与方案" class="form-grid__full">
            <el-input
              v-model="createForm.description"
              type="textarea"
              :rows="3"
              maxlength="1000"
              placeholder="记录故障现象、处理方案和需要准备的备件"
            />
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="createForm.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>创建工单
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="completeVisible" title="完成维护" width="560px" destroy-on-close>
      <el-alert v-if="completeError" type="error" :title="completeError" :closable="false" show-icon class="section-alert" />
      <p v-if="completeTarget" class="dialog-lead">
        {{ completeTarget.maintenanceNo }} · {{ completeTarget.deviceNo }} · {{ completeTarget.title }}
      </p>
      <el-form ref="completeFormRef" :model="completeForm" :rules="completeRules" label-position="top">
        <el-form-item label="维护成本（元）" prop="costYuan">
          <el-input v-model="completeForm.costYuan" inputmode="decimal" placeholder="0.00" />
          <template #extra><span class="field-hint">成本由公司承担，只做记录，不生成应收；最多两位小数并截断。</span></template>
        </el-form-item>
        <el-form-item label="成本说明">
          <el-input v-model="completeForm.costNote" type="textarea" :rows="2" maxlength="500" placeholder="外协、备件、人工等" />
        </el-form-item>
        <el-form-item label="停机时长（分钟）">
          <el-input-number v-model="completeForm.downtimeMinutes" :min="0" :controls="false" style="width: 100%" />
          <template #extra><span class="field-hint">留 0 时按实际开始到结束时间自动计算。</span></template>
        </el-form-item>
      </el-form>
      <el-alert type="warning" :closable="false" show-icon title="完成后的影响">
        <template #default>
          设备恢复空闲，等待队列按新的空闲时间重算计划时间，队列顺序不变；等待中的业务员会收到恢复通知。
        </template>
      </el-alert>
      <div class="form-actions">
        <el-button type="primary" :loading="completeSaving" @click="submitComplete">确认完成</el-button>
        <el-button @click="completeVisible = false">取消</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.cell-link {
  height: auto;
  padding: 0;
  font-size: 10px;
}

.cell-second-tag {
  margin-left: 4px;
}

.dialog-lead {
  margin: 0 0 14px;
  color: var(--ink-600);
  font-size: 12px;
}
</style>
