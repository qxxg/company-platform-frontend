<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search, Tools, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  createInspection,
  createMaintenanceFromInspection,
  fetchDeviceOptions,
  fetchInspectionPage,
} from '@/api/production'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDate, formatDateTime } from '@/utils/format'
import {
  INSPECTION_PLAN_TYPE,
  INSPECTION_PLAN_TYPE_OPTIONS,
  INSPECTION_RESULT,
  INSPECTION_RESULT_OPTIONS,
  inspectionResultLabel,
} from '@/constants'

/**
 * 设备点检保养记录（V1.4 设备管理）。
 *
 * 操作员按日/周/月登记点检结果；结果异常时可以直接生成维护工单，由维护流程
 * 统一安排停机与成本，避免问题在点检表和维护单之间重复登记。
 */
const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const factories = ref([])
const devices = ref([])
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: { total: 0, normal: 0, abnormal: 0, deviceCount: 0 },
})

const filters = reactive({
  keyword: '',
  factoryId: '',
  deviceId: '',
  result: '',
  planType: '',
  page: 1,
  size: 10,
})

const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createFormRef = ref()
const createForm = reactive({
  deviceId: '',
  planType: 'DAILY',
  inspectionDate: new Date().toISOString().slice(0, 10),
  result: 'NORMAL',
  itemCount: 6,
  abnormalCount: 0,
  content: '',
})

const canWrite = computed(() => auth.hasPermission('equipment:inspection:write'))
const canCreateMaintenance = computed(() => auth.hasPermission('equipment:maintenance:write'))
const hasFilters = computed(
  () => Boolean(filters.keyword || filters.factoryId || filters.deviceId || filters.result || filters.planType),
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

// 厂长只能登记本厂设备的点检；操作员和管理员按可见设备登记。
const inspectableDevices = computed(() => {
  if (!isFactoryManager.value) return devices.value
  return devices.value.filter((item) => String(item.factoryId) === String(auth.factoryId))
})

const createRules = {
  deviceId: [{ required: true, message: '请选择设备', trigger: 'change' }],
  inspectionDate: [{ required: true, message: '请选择点检日期', trigger: 'change' }],
  itemCount: [{ required: true, message: '请输入点检项数', trigger: 'blur' }],
  abnormalCount: [
    {
      validator: (_rule, value, callback) => {
        const itemCount = Number(createForm.itemCount || 0)
        const abnormalCount = Number(value || 0)
        if (abnormalCount > itemCount) {
          callback(new Error('异常项数不能超过点检项数'))
          return
        }
        if (createForm.result === 'ABNORMAL' && abnormalCount === 0) {
          callback(new Error('结果为异常时必须填写异常项数'))
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

function resultTagType(value) {
  return INSPECTION_RESULT[value]?.type || 'info'
}

function planTagType(value) {
  return INSPECTION_PLAN_TYPE[value]?.type || 'info'
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

async function loadRecords() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.factoryId) params.factoryId = filters.factoryId
    if (filters.deviceId) params.deviceId = filters.deviceId
    if (filters.result) params.result = filters.result
    if (filters.planType) params.planType = filters.planType
    const data = await fetchInspectionPage(params)
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
  loadRecords()
}

function resetFilters() {
  filters.keyword = ''
  filters.factoryId = ''
  filters.deviceId = ''
  filters.result = ''
  filters.planType = ''
  filters.page = 1
  loadRecords()
}

function openCreate() {
  Object.assign(createForm, {
    deviceId: '',
    planType: 'DAILY',
    inspectionDate: new Date().toISOString().slice(0, 10),
    result: 'NORMAL',
    itemCount: 6,
    abnormalCount: 0,
    content: '',
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
    await createInspection({
      deviceId: createForm.deviceId,
      planType: createForm.planType,
      inspectionDate: createForm.inspectionDate,
      result: createForm.result,
      itemCount: Number(createForm.itemCount || 0),
      abnormalCount: Number(createForm.abnormalCount || 0),
      content: createForm.content.trim() || null,
    })
    ElMessage.success('点检记录已登记')
    createVisible.value = false
    await loadRecords()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function handleCreateMaintenance(row) {
  try {
    await ElMessageBox.confirm(
      `由该异常点检生成维护工单？生成的工单为“点检整改”类型，等待维护人员确认后开始。`,
      '生成维护工单',
      { confirmButtonText: '生成工单', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    const order = await createMaintenanceFromInspection(row.id)
    ElMessage.success(`已生成维护工单 ${order.maintenanceNo}`)
    await loadRecords()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(async () => {
  await Promise.all([loadFactories(), loadDevices()])
  await loadRecords()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="EQUIPMENT · INSPECTION"
      title="点检保养记录"
      description="登记设备日常、周度与月度点检结果；发现异常可直接生成维护工单，安排停机整改。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadRecords">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>登记点检
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="点检口径">
      <template #default>
        点检只登记检查结论，不修改设备状态；结果异常时请生成维护工单，由维护流程统一安排停机与成本。
        异常项数不能超过点检项数，点检日期不能晚于今天。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Tools /></el-icon></div>
        <div>
          <span class="metric-card__label">点检记录</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.total).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">覆盖 {{ pageData.summary.deviceCount }} 台设备</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><Tools /></el-icon></div>
        <div>
          <span class="metric-card__label">正常</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.normal).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">无需处理</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--red"><el-icon><Warning /></el-icon></div>
        <div>
          <span class="metric-card__label">异常</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.abnormal).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">需生成维护工单整改</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="设备编号、点检内容或点检人"
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
        <el-form-item label="结果">
          <el-select v-model="filters.result" placeholder="全部结果" clearable>
            <el-option v-for="item in INSPECTION_RESULT_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="周期">
          <el-select v-model="filters.planType" placeholder="全部周期" clearable>
            <el-option v-for="item in INSPECTION_PLAN_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <span>异常点检可一键生成“点检整改”维护工单。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">INSPECTION RECORDS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 条点检记录</h2>
        </div>
        <span class="table-panel__meta">点检周期：日常 / 周度 / 月度</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="设备" min-width="190">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.deviceNo }}</div>
            <div class="cell-secondary">{{ row.deviceName || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工厂" min-width="120">
          <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
        </el-table-column>
        <el-table-column label="周期" width="140">
          <template #default="{ row }">
            <el-tag :type="planTagType(row.planType)" size="small" effect="plain">
              {{ INSPECTION_PLAN_TYPE[row.planType]?.label || row.planType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="点检日期" width="120">
          <template #default="{ row }">{{ formatDate(row.inspectionDate) }}</template>
        </el-table-column>
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="resultTagType(row.result)" effect="light">{{ inspectionResultLabel(row.result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="点检项" width="100" align="right">
          <template #default="{ row }">
            <div>{{ row.itemCount ?? 0 }} 项</div>
            <div class="cell-secondary">异常 {{ row.abnormalCount ?? 0 }} 项</div>
          </template>
        </el-table-column>
        <el-table-column label="点检内容" min-width="240">
          <template #default="{ row }">{{ row.content || '—' }}</template>
        </el-table-column>
        <el-table-column label="点检人" width="110">
          <template #default="{ row }">{{ row.handlerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="登记时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column v-if="canCreateMaintenance" label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.result === 'ABNORMAL'" link type="warning" @click="handleCreateMaintenance(row)">
              <el-icon><Tools /></el-icon>生成维护工单
            </el-button>
            <span v-else class="muted-text">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无点检记录" description="操作员可按日/周/月登记设备点检结果。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadRecords() }"
          @current-change="(page) => { filters.page = page; loadRecords() }"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="登记点检记录" width="680px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="设备" prop="deviceId">
            <el-select v-model="createForm.deviceId" filterable placeholder="选择点检设备">
              <el-option
                v-for="device in inspectableDevices"
                :key="device.id"
                :label="`${device.deviceNo} · ${device.deviceName} · ${factoryName(device.factoryId)}`"
                :value="String(device.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="点检周期">
            <el-select v-model="createForm.planType">
              <el-option v-for="item in INSPECTION_PLAN_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="点检日期" prop="inspectionDate">
            <el-input v-model="createForm.inspectionDate" type="date" />
          </el-form-item>
          <el-form-item label="点检结果">
            <el-select v-model="createForm.result">
              <el-option v-for="item in INSPECTION_RESULT_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="点检项数" prop="itemCount">
            <el-input-number v-model="createForm.itemCount" :min="0" :controls="false" style="width: 100%" />
          </el-form-item>
          <el-form-item label="异常项数" prop="abnormalCount">
            <el-input-number v-model="createForm.abnormalCount" :min="0" :controls="false" style="width: 100%" />
            <template #extra><span class="field-hint">结果为“异常”时必须大于 0。</span></template>
          </el-form-item>
          <el-form-item label="点检内容" class="form-grid__full">
            <el-input
              v-model="createForm.content"
              type="textarea"
              :rows="3"
              maxlength="1000"
              placeholder="记录检查项、异常现象和处理建议"
            />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>登记点检
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>
