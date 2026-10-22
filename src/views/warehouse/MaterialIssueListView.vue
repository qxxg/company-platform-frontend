<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Close, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  cancelMaterialIssue,
  createMaterialIssue,
  fetchMaterialIssuePage,
  fetchMaterialOptions,
  fetchWarehouseOptions,
  issueMaterial,
} from '@/api/warehouse'
import { fetchWorkOrderPage } from '@/api/production'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { MATERIAL_ISSUE_STATUS, MATERIAL_ISSUE_STATUS_OPTIONS, materialIssueStatusLabel } from '@/constants'

/**
 * 工单领料（V1.4 仓储与生产）。
 *
 * 领料单把仓库物料与生产工单关联：建单为待发料，确认发料时扣减仓库库存并把
 * 金额计入工单材料成本。单价与损耗率取自物料档案，金额按“数量 × 单价”截断到分。
 */
const auth = useAuthStore()
const route = useRoute()

const loading = ref(false)
const loadError = ref('')
const warehouses = ref([])
const materials = ref([])
const workOrders = ref([])
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: { total: 0, pending: 0, completed: 0, totalAmount: 0 },
})

const filters = reactive({
  keyword: '',
  workOrderId: '',
  warehouseId: '',
  status: '',
  page: 1,
  size: 10,
})

const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createFormRef = ref()
const createForm = reactive({
  workOrderId: '',
  warehouseId: '',
  remark: '',
  lines: [{ materialId: '', quantity: '', remark: '' }],
})

const detailVisible = ref(false)
const detailTarget = ref(null)

const canIssue = computed(() => auth.hasPermission('warehouse:outbound'))
const canViewCost = computed(() => auth.hasPermission('production:cost:read'))

function statusTag(value) {
  return MATERIAL_ISSUE_STATUS[value]?.type || 'info'
}

function canShip(row) {
  return canIssue.value && row.status === 'PENDING'
}

function canCancel(row) {
  return canIssue.value && row.status === 'PENDING'
}

async function loadOptions() {
  try {
    warehouses.value = (await fetchWarehouseOptions()) || []
  } catch {
    warehouses.value = []
  }
  try {
    materials.value = (await fetchMaterialOptions()) || []
  } catch {
    materials.value = []
  }
  try {
    // 只列出排队中或生产中的工单：这些工单才允许领料。
    const data = await fetchWorkOrderPage({ page: 1, size: 100 })
    workOrders.value = (data.records || []).filter((item) => ['QUEUED', 'RUNNING'].includes(item.status))
  } catch {
    workOrders.value = []
  }
}

async function loadIssues() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.workOrderId.trim()) params.workOrderId = filters.workOrderId.trim()
    if (filters.warehouseId) params.warehouseId = filters.warehouseId
    if (filters.status) params.status = filters.status
    const data = await fetchMaterialIssuePage(params)
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
  loadIssues()
}

function openCreate() {
  Object.assign(createForm, {
    workOrderId: '',
    warehouseId: '',
    remark: '',
    lines: [{ materialId: '', quantity: '', remark: '' }],
  })
  createError.value = ''
  createVisible.value = true
}

function addLine() {
  createForm.lines.push({ materialId: '', quantity: '', remark: '' })
}

function removeLine(index) {
  if (createForm.lines.length <= 1) return
  createForm.lines.splice(index, 1)
}

async function submitCreate() {
  createError.value = ''
  if (!createForm.workOrderId) {
    createError.value = '请选择生产工单'
    return
  }
  if (!createForm.warehouseId) {
    createError.value = '请选择领料仓库'
    return
  }
  const lines = createForm.lines
    .filter((line) => line.materialId && String(line.quantity).trim() !== '')
    .map((line) => ({
      materialId: line.materialId,
      quantity: String(line.quantity).trim(),
      remark: line.remark.trim() || null,
    }))
  if (!lines.length) {
    createError.value = '请至少填写一行有效明细'
    return
  }
  createSaving.value = true
  try {
    await createMaterialIssue(createForm.workOrderId, {
      warehouseId: createForm.warehouseId,
      remark: createForm.remark.trim() || null,
      lines,
    })
    ElMessage.success('领料单已创建，等待仓库发料')
    createVisible.value = false
    await loadIssues()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function handleIssue(row) {
  try {
    await ElMessageBox.confirm(
      `确认发料 ${row.issueNo}？发料后扣减 ${row.warehouseNo} 库存并计入工单材料成本。`,
      '确认发料',
      { confirmButtonText: '确认发料', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await issueMaterial(row.id)
    ElMessage.success('已发料，库存与工单材料成本已更新')
    await loadIssues()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(`确认取消领料单 ${row.issueNo}？`, '取消领料单', {
      confirmButtonText: '取消单据',
      cancelButtonText: '返回',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await cancelMaterialIssue(row.id)
    ElMessage.success('领料单已取消')
    await loadIssues()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openDetail(row) {
  detailTarget.value = row
  detailVisible.value = true
}

onMounted(async () => {
  // 支持从订单详情跳转过来时按工单预置过滤条件。
  const presetWorkOrderId = route.query.workOrderId
  if (presetWorkOrderId) {
    filters.workOrderId = String(presetWorkOrderId)
  }
  await loadOptions()
  await loadIssues()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="WAREHOUSE · MATERIAL ISSUE"
      title="工单领料"
      description="领料把仓库物料与生产工单关联：确认发料时扣减库存并计入工单材料成本。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadIssues">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canIssue" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建领料单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="领料口径">
      <template #default>
        建单不扣库存，确认发料才扣减并计入工单材料成本；领料仓库必须与工单同厂，工单需处于排队中或生产中。
        单价与损耗率取自物料档案，金额按“数量 × 单价”截断到分。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Tickets /></el-icon></div>
        <div>
          <span class="metric-card__label">领料单</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.total).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">待发料 {{ pageData.summary.pending }} · 已发料 {{ pageData.summary.completed }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><CircleCheck /></el-icon></div>
        <div>
          <span class="metric-card__label">领料金额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">计入工单材料成本</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="领料单号、工单号或订单号"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="工单 ID">
          <el-input v-model="filters.workOrderId" placeholder="精确工单 ID" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="仓库">
          <el-select v-model="filters.warehouseId" placeholder="全部仓库" clearable filterable>
            <el-option
              v-for="warehouse in warehouses"
              :key="warehouse.id"
              :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName}`"
              :value="String(warehouse.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in MATERIAL_ISSUE_STATUS_OPTIONS"
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
        </el-form-item>
      </el-form>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">MATERIAL ISSUES</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张领料单</h2>
        </div>
        <span class="table-panel__meta">金额以分存储，页面按元展示</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="领料单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.issueNo }}</div>
            <div class="cell-secondary">建单 {{ formatDateTime(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="工单 / 订单" min-width="200">
          <template #default="{ row }">
            <div class="mono-text">{{ row.workOrderNo }}</div>
            <div class="cell-secondary">订单 {{ row.orderNo }} · 客户 #{{ row.customerId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="仓库" min-width="150">
          <template #default="{ row }">
            <div class="mono-text">{{ row.warehouseNo }}</div>
            <div class="cell-secondary">{{ row.warehouseName }}</div>
          </template>
        </el-table-column>
        <el-table-column label="领料金额" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="明细" width="90" align="right">
          <template #default="{ row }">{{ (row.lines || []).length }} 行</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="light">{{ materialIssueStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发料人 / 时间" min-width="170">
          <template #default="{ row }">
            <div>{{ row.operatorName || '—' }}</div>
            <div class="cell-secondary">{{ formatDateTime(row.issuedAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">明细</el-button>
            <el-button v-if="canShip(row)" link type="success" @click="handleIssue(row)">
              <el-icon><CircleCheck /></el-icon>发料
            </el-button>
            <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">
              <el-icon><Close /></el-icon>取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无领料单" description="工单排产后可在仓储管理中登记领料单。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadIssues() }"
          @current-change="(page) => { filters.page = page; loadIssues() }"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建领料单" width="880px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="生产工单">
            <el-select v-model="createForm.workOrderId" filterable placeholder="选择排队中或生产中的工单">
              <el-option
                v-for="workOrder in workOrders"
                :key="workOrder.id"
                :label="`${workOrder.workOrderNo} · 订单 ${workOrder.orderNo} · ${workOrder.deviceNo || '待排产'} · ${workOrder.status}`"
                :value="String(workOrder.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="领料仓库">
            <el-select v-model="createForm.warehouseId" filterable placeholder="选择同厂仓库">
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName}`"
                :value="String(warehouse.id)"
              />
            </el-select>
            <template #extra><span class="field-hint">领料仓库必须与工单同厂，否则服务端会拒绝。</span></template>
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="createForm.remark" placeholder="可选" maxlength="500" />
          </el-form-item>
        </div>

        <div class="form-section-title">领料明细</div>
        <div class="line-list">
          <div v-for="(line, index) in createForm.lines" :key="index" class="line-row">
            <el-select v-model="line.materialId" filterable placeholder="选择物料" class="line-row__material">
              <el-option
                v-for="material in materials"
                :key="material.id"
                :label="`${material.materialCode} · ${material.materialName} · ${material.unit} · ${material.unitPrice}`"
                :value="String(material.id)"
              />
            </el-select>
            <el-input v-model="line.quantity" placeholder="数量" inputmode="decimal" class="line-row__qty" />
            <el-input v-model="line.remark" placeholder="行备注（可选）" class="line-row__remark" />
            <el-button link type="danger" @click="removeLine(index)">移除</el-button>
          </div>
        </div>
        <el-button link type="primary" @click="addLine">
          <el-icon><Plus /></el-icon>添加一行
        </el-button>

        <el-alert v-if="canViewCost" type="info" :closable="false" show-icon class="section-alert">
          <template #default>
            发料后金额会计入工单材料成本（单位：分，按“数量 × 单价”截断），订单详情页可查看工单成本合计。
          </template>
        </el-alert>

        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>创建领料单
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="领料单明细" width="760px" destroy-on-close>
      <template v-if="detailTarget">
        <p class="dialog-lead">
          {{ detailTarget.issueNo }} · {{ detailTarget.workOrderNo }} · {{ detailTarget.warehouseNo }} ·
          合计 {{ formatMoney(detailTarget.totalAmount) }}
        </p>
        <el-table :data="detailTarget.lines || []" class="data-table" size="small">
          <el-table-column label="物料" min-width="180">
            <template #default="{ row }">
              <div class="mono-text">{{ row.materialCode }}</div>
              <div class="cell-secondary">{{ row.materialName }}</div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="120" align="right">
            <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="单价" width="110" align="right">
            <template #default="{ row }">{{ row.unitPrice }}</template>
          </el-table-column>
          <el-table-column label="行金额" width="120" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.line-list {
  display: grid;
  gap: 8px;
  margin-bottom: 8px;
}

.line-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 120px minmax(0, 1fr) 60px;
  align-items: center;
  gap: 8px;
}

.dialog-lead {
  margin: 0 0 14px;
  color: var(--ink-600);
  font-size: 12px;
}
</style>
