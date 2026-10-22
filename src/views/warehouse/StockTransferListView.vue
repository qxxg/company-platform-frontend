<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Close, Plus, Refresh, Search, Van } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  cancelStockTransfer,
  createStockTransfer,
  fetchMaterialOptions,
  fetchStockTransferPage,
  fetchWarehouseOptions,
  receiveStockTransfer,
  shipStockTransfer,
} from '@/api/warehouse'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDate, formatDateTime } from '@/utils/format'
import { STOCK_TRANSFER_STATUS, STOCK_TRANSFER_STATUS_OPTIONS, stockTransferStatusLabel } from '@/constants'

/**
 * 跨厂调拨（V1.4 仓储系统）。
 *
 * 调拨是库存“转移”的唯一通道：出库扣减调出仓库、入库增加调入仓库，数量不允许
 * 为负。跨厂调拨允许，出库与入库由两边工厂分别确认，系统不做自动在途结算。
 */
const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const factories = ref([])
const warehouses = ref([])
const materials = ref([])
const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: { total: 0, pending: 0, inTransit: 0, completed: 0 },
})

const filters = reactive({
  keyword: '',
  status: '',
  factoryId: '',
  page: 1,
  size: 10,
})

const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createFormRef = ref()
const createForm = reactive({
  fromWarehouseId: '',
  toWarehouseId: '',
  plannedDate: new Date().toISOString().slice(0, 10),
  remark: '',
  lines: [{ materialId: '', quantity: '', remark: '' }],
})

const detailVisible = ref(false)
const detailTarget = ref(null)

const canOutbound = computed(() => auth.hasPermission('warehouse:outbound'))
const canInbound = computed(() => auth.hasPermission('warehouse:inbound'))
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

const createRules = {
  fromWarehouseId: [{ required: true, message: '请选择调出仓库', trigger: 'change' }],
  toWarehouseId: [{ required: true, message: '请选择调入仓库', trigger: 'change' }],
  plannedDate: [{ required: true, message: '请选择计划日期', trigger: 'change' }],
}

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function statusTag(value) {
  return STOCK_TRANSFER_STATUS[value]?.type || 'info'
}

function canShip(row) {
  return canOutbound.value && row.status === 'PENDING'
}

function canReceive(row) {
  return canInbound.value && row.status === 'IN_TRANSIT'
}

function canCancel(row) {
  return canOutbound.value && row.status === 'PENDING'
}

async function loadOptions() {
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
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
}

async function loadTransfers() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    if (filters.factoryId) params.factoryId = filters.factoryId
    const data = await fetchStockTransferPage(params)
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
  loadTransfers()
}

function openCreate() {
  Object.assign(createForm, {
    fromWarehouseId: '',
    toWarehouseId: '',
    plannedDate: new Date().toISOString().slice(0, 10),
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
  try {
    await createFormRef.value.validate()
  } catch {
    return
  }
  if (createForm.fromWarehouseId === createForm.toWarehouseId) {
    createError.value = '调出仓库和调入仓库不能相同'
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
    await createStockTransfer({
      fromWarehouseId: createForm.fromWarehouseId,
      toWarehouseId: createForm.toWarehouseId,
      plannedDate: createForm.plannedDate,
      remark: createForm.remark.trim() || null,
      lines,
    })
    ElMessage.success('调拨单已创建，等待出库')
    createVisible.value = false
    await loadTransfers()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function handleShip(row) {
  try {
    await ElMessageBox.confirm(
      `确认出库 ${row.transferNo}？出库后调出仓库库存立即扣减，库存不足时整单失败。`,
      '确认出库',
      { confirmButtonText: '确认出库', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await shipStockTransfer(row.id)
    ElMessage.success('已出库，物料在途')
    await loadTransfers()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleReceive(row) {
  try {
    await ElMessageBox.confirm(
      `确认入库 ${row.transferNo}？入库后调入仓库库存增加。`,
      '确认入库',
      { confirmButtonText: '确认入库', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await receiveStockTransfer(row.id)
    ElMessage.success('已入库，库存已增加')
    await loadTransfers()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(`确认取消调拨单 ${row.transferNo}？`, '取消调拨单', {
      confirmButtonText: '取消单据',
      cancelButtonText: '返回',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await cancelStockTransfer(row.id)
    ElMessage.success('调拨单已取消')
    await loadTransfers()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function openDetail(row) {
  detailTarget.value = row
  detailVisible.value = true
}

onMounted(async () => {
  await loadOptions()
  await loadTransfers()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="WAREHOUSE · STOCK TRANSFER"
      title="跨厂调拨"
      description="跨厂移库走调拨单：出库扣减调出仓库，入库增加调入仓库，库存数量不允许为负。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadTransfers">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canOutbound" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建调拨单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="调拨口径">
      <template #default>
        调拨单先建单（待出库），出库时按条件扣减来源库存，库存不足整单失败；入库由调入工厂确认。
        同厂仓库之间也允许调拨，用于车间内部移库。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Van /></el-icon></div>
        <div>
          <span class="metric-card__label">调拨单</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.total).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">待出库 {{ pageData.summary.pending }} · 在途 {{ pageData.summary.inTransit }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><CircleCheck /></el-icon></div>
        <div>
          <span class="metric-card__label">已入库</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.completed).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">双方库存都已结转</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="调拨单号" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in STOCK_TRANSFER_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="工厂">
          <el-select v-model="filters.factoryId" placeholder="全部工厂" clearable>
            <el-option
              v-for="factory in visibleFactories"
              :key="factory.id"
              :label="factory.name"
              :value="String(factory.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>选择工厂后只显示与该工厂相关的调拨（调出或调入）。</span>
        <span>出库需要出库权限，入库需要入库权限。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">STOCK TRANSFERS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张调拨单</h2>
        </div>
        <span class="table-panel__meta">数量 2 位小数，出入库均不可为负</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="调拨单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.transferNo }}</div>
            <div class="cell-secondary">创建 {{ formatDateTime(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="调出 → 调入" min-width="240">
          <template #default="{ row }">
            <div class="mono-text">{{ row.fromWarehouseNo }} · {{ factoryName(row.fromFactoryId) }}</div>
            <div class="cell-secondary">→ {{ row.toWarehouseNo }} · {{ factoryName(row.toFactoryId) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="计划日期" width="120">
          <template #default="{ row }">{{ formatDate(row.plannedDate) }}</template>
        </el-table-column>
        <el-table-column label="明细" width="90" align="right">
          <template #default="{ row }">{{ (row.lines || []).length }} 行</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="light">{{ stockTransferStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="出库 / 入库时间" min-width="190">
          <template #default="{ row }">
            <div>{{ formatDateTime(row.shippedAt) }}</div>
            <div class="cell-secondary">{{ formatDateTime(row.receivedAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">明细</el-button>
            <el-button v-if="canShip(row)" link type="warning" @click="handleShip(row)">出库</el-button>
            <el-button v-if="canReceive(row)" link type="success" @click="handleReceive(row)">入库</el-button>
            <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">
              <el-icon><Close /></el-icon>取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无调拨单" description="跨厂移库请新建调拨单，先出库后入库。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadTransfers() }"
          @current-change="(page) => { filters.page = page; loadTransfers() }"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建调拨单" width="860px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="调出仓库" prop="fromWarehouseId">
            <el-select v-model="createForm.fromWarehouseId" filterable placeholder="选择调出仓库">
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName} · ${factoryName(warehouse.factoryId)}`"
                :value="String(warehouse.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="调入仓库" prop="toWarehouseId">
            <el-select v-model="createForm.toWarehouseId" filterable placeholder="选择调入仓库">
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName} · ${factoryName(warehouse.factoryId)}`"
                :value="String(warehouse.id)"
              />
            </el-select>
            <template #extra><span class="field-hint">跨厂调拨允许；同厂调拨用于车间内部移库。</span></template>
          </el-form-item>
          <el-form-item label="计划日期" prop="plannedDate">
            <el-input v-model="createForm.plannedDate" type="date" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="createForm.remark" placeholder="可选" maxlength="500" />
          </el-form-item>
        </div>

        <div class="form-section-title">调拨明细</div>
        <div class="line-list">
          <div v-for="(line, index) in createForm.lines" :key="index" class="line-row">
            <el-select v-model="line.materialId" filterable placeholder="选择物料" class="line-row__material">
              <el-option
                v-for="material in materials"
                :key="material.id"
                :label="`${material.materialCode} · ${material.materialName} · ${material.unit}`"
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

        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>创建调拨单
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="调拨单明细" width="700px" destroy-on-close>
      <template v-if="detailTarget">
        <p class="dialog-lead">
          {{ detailTarget.transferNo }} · {{ detailTarget.fromWarehouseNo }} →
          {{ detailTarget.toWarehouseNo }}
        </p>
        <el-table :data="detailTarget.lines || []" class="data-table" size="small">
          <el-table-column label="物料" min-width="200">
            <template #default="{ row }">
              <div class="mono-text">{{ row.materialCode }}</div>
              <div class="cell-secondary">{{ row.materialName }}</div>
            </template>
          </el-table-column>
          <el-table-column label="调拨数量" width="140" align="right">
            <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="备注" min-width="140">
            <template #default="{ row }">{{ row.remark || '—' }}</template>
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
