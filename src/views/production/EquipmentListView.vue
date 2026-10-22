<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Cpu, Edit, Plus, Refresh, Search, SetUp } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  changeDeviceStatus,
  createDevice,
  fetchDevicePage,
  updateDevice,
} from '@/api/production'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import {
  DEVICE_STATUS,
  DEVICE_STATUS_OPTIONS,
  MANUAL_DEVICE_STATUS_OPTIONS,
  deviceStatusLabel,
} from '@/constants'

/**
 * 设备台账（V1.4 设备管理）。
 *
 * 设备编号全公司唯一，归属单一工厂；能力字段只用于排产匹配，不绑定客户。
 * RUNNING 只能由开始工单进入，人工状态接口只开放空闲/保养/故障/停用。
 */
const auth = useAuthStore()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')
const factories = ref([])
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: {
    total: 0,
    idle: 0,
    running: 0,
    maintenance: 0,
    fault: 0,
    disabled: 0,
    queuedWorkOrders: 0,
  },
})

const filters = reactive({
  keyword: '',
  factoryId: '',
  status: '',
  page: 1,
  size: 10,
})

const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()
const editingId = ref(null)

const statusVisible = ref(false)
const statusSaving = ref(false)
const statusError = ref('')
const statusFormRef = ref()
const statusTarget = ref(null)
const statusForm = reactive({
  status: 'IDLE',
  reason: '',
})

const form = reactive({
  deviceNo: '',
  deviceName: '',
  deviceType: '',
  model: '',
  factoryId: '',
  workshop: '',
  location: '',
  materialTypes: '',
  minWidthMm: null,
  maxWidthMm: null,
  processTypes: '',
  capacityMetersPerHour: '',
  changeoverMinutes: 0,
  yieldRate: '',
  operatorRequirement: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('equipment:write'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.factoryId || filters.status))
const isEditing = computed(() => editingId.value !== null)
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

// 厂长只能操作本厂设备，页面只展示并允许选择本厂，避免提交后被服务端拒绝。
const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

const rules = {
  deviceNo: [
    { required: true, message: '请输入设备编号', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,64}$/,
      message: '设备编号只能包含字母、数字、下划线和短横线',
      trigger: 'blur',
    },
  ],
  deviceName: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  deviceType: [{ required: true, message: '请输入设备类型', trigger: 'blur' }],
  factoryId: [{ required: true, message: '请选择所属工厂', trigger: 'change' }],
  capacityMetersPerHour: [
    { required: true, message: '请输入设备产能', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const number = Number(value)
        if (Number.isNaN(number) || number <= 0) {
          callback(new Error('设备产能必须大于 0'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  minWidthMm: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || value === '') {
          callback()
          return
        }
        if (form.maxWidthMm !== null && form.maxWidthMm !== undefined && form.maxWidthMm !== ''
          && Number(value) > Number(form.maxWidthMm)) {
          callback(new Error('最小门幅不能大于最大门幅'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  maxWidthMm: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || value === '') {
          callback()
          return
        }
        if (form.minWidthMm !== null && form.minWidthMm !== undefined && form.minWidthMm !== ''
          && Number(value) < Number(form.minWidthMm)) {
          callback(new Error('最大门幅不能小于最小门幅'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  yieldRate: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || String(value).trim() === '') {
          callback()
          return
        }
        const number = Number(value)
        if (Number.isNaN(number) || number < 0 || number > 100) {
          callback(new Error('良率必须在 0–100 之间'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const statusRules = {
  status: [{ required: true, message: '请选择目标状态', trigger: 'change' }],
}

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function statusTagType(value) {
  return DEVICE_STATUS[value]?.type || 'info'
}

function capabilityTokens(value) {
  return String(value || '')
    .split(/[,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
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
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.factoryId) params.factoryId = filters.factoryId
    if (filters.status) params.status = filters.status
    const data = await fetchDevicePage(params)
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
  loadDevices()
}

function resetFilters() {
  filters.keyword = ''
  filters.factoryId = ''
  filters.status = ''
  filters.page = 1
  loadDevices()
}

function resetForm() {
  Object.assign(form, {
    deviceNo: '',
    deviceName: '',
    deviceType: '',
    model: '',
    factoryId: isFactoryManager.value && auth.factoryId ? String(auth.factoryId) : '',
    workshop: '',
    location: '',
    materialTypes: '',
    minWidthMm: null,
    maxWidthMm: null,
    processTypes: '',
    capacityMetersPerHour: '',
    changeoverMinutes: 0,
    yieldRate: '',
    operatorRequirement: '',
    remark: '',
  })
  formError.value = ''
}

function openCreate() {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    deviceNo: row.deviceNo || '',
    deviceName: row.deviceName || '',
    deviceType: row.deviceType || '',
    model: row.model || '',
    factoryId: String(row.factoryId || ''),
    workshop: row.workshop || '',
    location: row.location || '',
    materialTypes: row.materialTypes || '',
    minWidthMm: row.minWidthMm ?? null,
    maxWidthMm: row.maxWidthMm ?? null,
    processTypes: row.processTypes || '',
    capacityMetersPerHour: row.capacityMetersPerHour != null ? String(row.capacityMetersPerHour) : '',
    changeoverMinutes: row.changeoverMinutes ?? 0,
    yieldRate: row.yieldRate != null ? String(row.yieldRate) : '',
    operatorRequirement: row.operatorRequirement || '',
    remark: row.remark || '',
  })
  formError.value = ''
  dialogVisible.value = true
}

function payloadFromForm() {
  return {
    deviceName: form.deviceName.trim(),
    deviceType: form.deviceType.trim(),
    model: form.model.trim() || null,
    workshop: form.workshop.trim() || null,
    location: form.location.trim() || null,
    materialTypes: form.materialTypes.trim() || null,
    minWidthMm: form.minWidthMm,
    maxWidthMm: form.maxWidthMm,
    processTypes: form.processTypes.trim() || null,
    capacityMetersPerHour: String(form.capacityMetersPerHour),
    changeoverMinutes: Number(form.changeoverMinutes || 0),
    yieldRate: form.yieldRate === '' ? null : String(form.yieldRate),
    operatorRequirement: form.operatorRequirement.trim() || null,
    remark: form.remark.trim() || null,
  }
}

async function submit() {
  formError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    if (isEditing.value) {
      await updateDevice(editingId.value, payloadFromForm())
      ElMessage.success('设备台账已更新')
    } else {
      await createDevice({
        ...payloadFromForm(),
        deviceNo: form.deviceNo.trim().toUpperCase(),
        factoryId: form.factoryId,
      })
      ElMessage.success('设备已创建')
    }
    dialogVisible.value = false
    await loadDevices()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

function openStatus(row) {
  statusTarget.value = row
  statusForm.status = row.status === 'RUNNING' ? 'IDLE' : row.status
  statusForm.reason = ''
  statusError.value = ''
  statusVisible.value = true
}

async function submitStatus() {
  statusError.value = ''
  try {
    await statusFormRef.value.validate()
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将设备 ${statusTarget.value.deviceNo} 变更为“${deviceStatusLabel(statusForm.status)}”？`,
      '变更设备状态',
      { confirmButtonText: '确认变更', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  statusSaving.value = true
  try {
    await changeDeviceStatus(statusTarget.value.id, {
      status: statusForm.status,
      reason: statusForm.reason.trim() || null,
    })
    ElMessage.success('设备状态已更新')
    statusVisible.value = false
    await loadDevices()
  } catch (error) {
    statusError.value = errorMessage(error)
  } finally {
    statusSaving.value = false
  }
}

function openCurrentOrder(row) {
  if (row.currentOrderNo) router.push(`/orders/${row.currentOrderNo}`)
}

onMounted(async () => {
  await loadFactories()
  await loadDevices()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="EQUIPMENT · LEDGER"
      title="设备台账"
      description="维护设备能力、位置与运行状态，为同工厂排产和设备队列提供基础数据。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadDevices">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建设备
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="设备管理口径">
      <template #default>
        设备编号全公司唯一，一台设备只能归属一个工厂；跨厂移机需走审批。设备维护费用全部由公司承担，
        不计算设备使用费。生产中状态由开始工单自动进入，不能人工伪造。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Cpu /></el-icon></div>
        <div>
          <span class="metric-card__label">设备总数</span>
          <strong class="metric-card__value">{{ pageData.summary.total.toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">停用 {{ pageData.summary.disabled }} 台</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><SetUp /></el-icon></div>
        <div>
          <span class="metric-card__label">空闲设备</span>
          <strong class="metric-card__value">{{ pageData.summary.idle.toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">等待工单 {{ pageData.summary.queuedWorkOrders }} 条</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber"><el-icon><Cpu /></el-icon></div>
        <div>
          <span class="metric-card__label">生产中</span>
          <strong class="metric-card__value">{{ pageData.summary.running.toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">同一设备只执行一个工单</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--red"><el-icon><SetUp /></el-icon></div>
        <div>
          <span class="metric-card__label">保养 / 故障</span>
          <strong class="metric-card__value">
            {{ (Number(pageData.summary.maintenance) + Number(pageData.summary.fault)).toLocaleString('zh-CN') }}
          </strong>
          <span class="metric-card__hint">等待队列保留，需人工恢复</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="设备编号、名称、类型或型号" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="工厂">
          <el-select v-model="filters.factoryId" placeholder="全部工厂" clearable>
            <el-option v-for="factory in visibleFactories" :key="factory.id" :label="factory.name" :value="String(factory.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in DEVICE_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <span>设备状态汇总按当前筛选条件统计，不受分页限制。</span>
        <span>设备仍可接受排队：生产中、保养和故障设备的等待队列会保留。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">DEVICE MASTER</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 台设备</h2>
        </div>
        <span class="table-panel__meta">产能单位：米/小时 · 门幅单位：毫米</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="设备编号 / 名称" min-width="210">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.deviceNo }}</div>
            <div class="cell-secondary">{{ row.deviceName }} · {{ row.deviceType }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工厂 / 位置" min-width="190">
          <template #default="{ row }">
            <div>{{ factoryName(row.factoryId) }}</div>
            <div class="cell-secondary">{{ [row.workshop, row.location].filter(Boolean).join(' · ') || '未填写位置' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="能力" min-width="230">
          <template #default="{ row }">
            <div class="tag-row">
              <el-tag v-for="item in capabilityTokens(row.materialTypes)" :key="`m-${item}`" size="small" effect="plain">
                {{ item }}
              </el-tag>
              <span v-if="!capabilityTokens(row.materialTypes).length" class="muted-text">材料不限</span>
            </div>
            <div class="cell-secondary">
              工艺：{{ capabilityTokens(row.processTypes).join('、') || '不限' }}<br />
              门幅：{{ row.minWidthMm ?? '不限' }}–{{ row.maxWidthMm ?? '不限' }}mm · 产能
              {{ row.capacityMetersPerHour }} 米/小时 · 换型 {{ row.changeoverMinutes }} 分钟
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ deviceStatusLabel(row.status) }}</el-tag>
            <div v-if="row.status === 'RUNNING'" class="cell-secondary">生产中</div>
          </template>
        </el-table-column>
        <el-table-column label="当前工单" min-width="180">
          <template #default="{ row }">
            <template v-if="row.currentWorkOrderNo">
              <el-button link type="primary" class="mono-text" @click="openCurrentOrder(row)">
                {{ row.currentWorkOrderNo }}
              </el-button>
              <div class="cell-secondary">订单 {{ row.currentOrderNo }}</div>
            </template>
            <span v-else class="muted-text">无</span>
          </template>
        </el-table-column>
        <el-table-column label="队列" width="110" align="right">
          <template #default="{ row }">
            <strong>{{ row.queueLength }}</strong>
            <div class="cell-secondary">等待/生产中</div>
          </template>
        </el-table-column>
        <el-table-column label="预计空闲" min-width="170">
          <template #default="{ row }">{{ row.nextFreeAt ? formatDateTime(row.nextFreeAt) : '—' }}</template>
        </el-table-column>
        <el-table-column v-if="canWrite" label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button link type="warning" @click="openStatus(row)">状态</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无设备" description="请调整筛选条件，或由设备管理员新建设备台账。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadDevices() }"
          @current-change="(page) => { filters.page = page; loadDevices() }"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="isEditing ? '编辑设备' : '新建设备'" width="820px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="section-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="设备编号" prop="deviceNo">
            <el-input v-model="form.deviceNo" :disabled="isEditing" placeholder="例如 EQ-F001-01" maxlength="64" />
            <template #extra><span class="field-hint">全公司唯一；创建后不可修改。</span></template>
          </el-form-item>
          <el-form-item label="设备名称" prop="deviceName">
            <el-input v-model="form.deviceName" placeholder="例如 数码印花一号机" maxlength="128" />
          </el-form-item>
          <el-form-item label="设备类型" prop="deviceType">
            <el-input v-model="form.deviceType" placeholder="例如 数码印花机" maxlength="64" />
          </el-form-item>
          <el-form-item label="型号">
            <el-input v-model="form.model" placeholder="可选" maxlength="128" />
          </el-form-item>
          <el-form-item label="所属工厂" prop="factoryId">
            <el-select v-model="form.factoryId" :disabled="isEditing || isFactoryManager" placeholder="请选择工厂">
              <el-option v-for="factory in visibleFactories" :key="factory.id" :label="factory.name" :value="String(factory.id)" />
            </el-select>
            <template #extra><span class="field-hint">创建后不可修改；跨厂移机需审批。</span></template>
          </el-form-item>
          <el-form-item label="车间 / 产线">
            <el-input v-model="form.workshop" placeholder="可选" maxlength="128" />
          </el-form-item>
          <el-form-item label="详细位置">
            <el-input v-model="form.location" placeholder="可选" maxlength="255" />
          </el-form-item>
          <el-form-item label="操作员资质要求">
            <el-input v-model="form.operatorRequirement" placeholder="可选，例如 印花操作证" maxlength="255" />
          </el-form-item>
          <el-form-item label="可处理材料">
            <el-input v-model="form.materialTypes" placeholder="逗号分隔，例如 COTTON,POLYESTER；留空表示不限" maxlength="500" />
          </el-form-item>
          <el-form-item label="可处理工艺">
            <el-input v-model="form.processTypes" placeholder="逗号分隔，例如 PRINT,DIGITAL；留空表示不限" maxlength="500" />
          </el-form-item>
          <el-form-item label="最小门幅（mm）" prop="minWidthMm">
            <el-input-number v-model="form.minWidthMm" :min="0" :controls="false" style="width: 100%" placeholder="不限" />
          </el-form-item>
          <el-form-item label="最大门幅（mm）" prop="maxWidthMm">
            <el-input-number v-model="form.maxWidthMm" :min="0" :controls="false" style="width: 100%" placeholder="不限" />
          </el-form-item>
          <el-form-item label="产能（米/小时）" prop="capacityMetersPerHour">
            <el-input v-model="form.capacityMetersPerHour" placeholder="例如 120" inputmode="decimal" />
            <template #extra><span class="field-hint">必须大于 0，最多两位小数。</span></template>
          </el-form-item>
          <el-form-item label="换型时间（分钟）">
            <el-input-number v-model="form.changeoverMinutes" :min="0" :controls="false" style="width: 100%" />
          </el-form-item>
          <el-form-item label="良率（%）" prop="yieldRate">
            <el-input v-model="form.yieldRate" placeholder="可选，例如 96.5" inputmode="decimal" />
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="submit">{{ isEditing ? '保存修改' : '创建设备' }}</el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="statusVisible" title="变更设备状态" width="520px" destroy-on-close>
      <el-alert v-if="statusError" type="error" :title="statusError" :closable="false" show-icon class="section-alert" />
      <el-form ref="statusFormRef" :model="statusForm" :rules="statusRules" label-position="top">
        <el-form-item label="目标状态" prop="status">
          <el-select v-model="statusForm.status">
            <el-option v-for="item in MANUAL_DEVICE_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更原因">
          <el-input v-model="statusForm.reason" type="textarea" :rows="3" maxlength="500" placeholder="保养、故障或停用原因，会写入状态日志" />
        </el-form-item>
        <el-alert type="warning" :closable="false" show-icon title="停机影响">
          <template #default>
            设备仍有等待队列时允许停机，队列会保留，并向受影响业务员发送交期风险消息。生产中工单必须先完成。
          </template>
        </el-alert>
        <div class="form-actions">
          <el-button type="primary" :loading="statusSaving" @click="submitStatus">确认变更</el-button>
          <el-button @click="statusVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}
</style>
