<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Close, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  cancelPurchaseReceipt,
  createPurchaseReceipt,
  fetchMaterialOptions,
  fetchPurchaseReceiptPage,
  fetchWarehouseOptions,
  receivePurchaseReceipt,
} from '@/api/warehouse'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDate, formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { PURCHASE_RECEIPT_STATUS, PURCHASE_RECEIPT_STATUS_OPTIONS, purchaseReceiptStatusLabel } from '@/constants'

/**
 * 采购入库（V1.4 仓储系统）。
 *
 * 采购入库是库存增加的唯一来源，也是材料成本的唯一来源。单据先建草稿，确认收货
 * 时按物料档案快照单价、计算行金额（数量 × 单价，按分截断）并增加库存；已收货
 * 单据不可修改，也不提供作废/红冲。
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
  summary: { total: 0, received: 0, draft: 0, totalAmount: 0 },
})

const filters = reactive({
  keyword: '',
  factoryId: '',
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
  warehouseId: '',
  supplierName: '',
  receiptDate: new Date().toISOString().slice(0, 10),
  remark: '',
  lines: [{ materialId: '', quantity: '', remark: '' }],
})

const detailVisible = ref(false)
const detailTarget = ref(null)

const canInbound = computed(() => auth.hasPermission('warehouse:inbound'))
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

const visibleWarehouses = computed(() => {
  if (!filters.factoryId) return warehouses.value
  return warehouses.value.filter((item) => String(item.factoryId) === String(filters.factoryId))
})

const createRules = {
  warehouseId: [{ required: true, message: '请选择收货仓库', trigger: 'change' }],
  supplierName: [{ required: true, message: '请输入供应商', trigger: 'blur' }],
  receiptDate: [{ required: true, message: '请选择收货日期', trigger: 'change' }],
}

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function statusTag(value) {
  return PURCHASE_RECEIPT_STATUS[value]?.type || 'info'
}

function canReceive(row) {
  return canInbound.value && row.status === 'DRAFT'
}

function canCancel(row) {
  return canInbound.value && row.status === 'DRAFT'
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

async function loadReceipts() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.factoryId) params.factoryId = filters.factoryId
    if (filters.warehouseId) params.warehouseId = filters.warehouseId
    if (filters.status) params.status = filters.status
    const data = await fetchPurchaseReceiptPage(params)
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
  loadReceipts()
}

function openCreate() {
  Object.assign(createForm, {
    warehouseId: '',
    supplierName: '',
    receiptDate: new Date().toISOString().slice(0, 10),
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
    await createPurchaseReceipt({
      warehouseId: createForm.warehouseId,
      supplierName: createForm.supplierName.trim(),
      receiptDate: createForm.receiptDate,
      remark: createForm.remark.trim() || null,
      lines,
    })
    ElMessage.success('入库单已创建，确认收货后增加库存')
    createVisible.value = false
    await loadReceipts()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    createSaving.value = false
  }
}

async function handleReceive(row) {
  try {
    await ElMessageBox.confirm(
      `确认收货 ${row.receiptNo}？收货后按明细增加仓库库存，单据不可再修改。`,
      '确认收货',
      { confirmButtonText: '确认收货', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await receivePurchaseReceipt(row.id)
    ElMessage.success('已收货，库存已增加')
    await loadReceipts()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function handleCancel(row) {
  try {
    await ElMessageBox.confirm(`确认取消入库单 ${row.receiptNo}？`, '取消入库单', {
      confirmButtonText: '取消单据',
      cancelButtonText: '返回',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await cancelPurchaseReceipt(row.id)
    ElMessage.success('入库单已取消')
    await loadReceipts()
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
  await loadReceipts()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="WAREHOUSE · PURCHASE INBOUND"
      title="采购入库"
      description="采购入库是库存增加的唯一来源，也是材料成本的唯一来源；单据先建草稿，确认收货后不可修改。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadReceipts">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canInbound" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建入库单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="入库口径">
      <template #default>
        行金额 = 数量 × 采购单价，按分截断；单价、损耗率以物料档案为准，前端不能自定义价格。
        已收货单据是材料成本的既成事实，不提供作废或红冲（审批中心上线前）。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon"><el-icon><Tickets /></el-icon></div>
        <div>
          <span class="metric-card__label">入库单</span>
          <strong class="metric-card__value">{{ Number(pageData.summary.total).toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">待收货 {{ pageData.summary.draft }} · 已入库 {{ pageData.summary.received }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green"><el-icon><CircleCheck /></el-icon></div>
        <div>
          <span class="metric-card__label">入库总金额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">按当前筛选条件统计</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="入库单号或供应商"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="工厂">
          <el-select v-model="filters.factoryId" placeholder="全部工厂" clearable @change="filters.warehouseId = ''">
            <el-option
              v-for="factory in visibleFactories"
              :key="factory.id"
              :label="factory.name"
              :value="String(factory.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="仓库">
          <el-select v-model="filters.warehouseId" placeholder="全部仓库" clearable filterable>
            <el-option
              v-for="warehouse in visibleWarehouses"
              :key="warehouse.id"
              :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName}`"
              :value="String(warehouse.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in PURCHASE_RECEIPT_STATUS_OPTIONS"
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
          <span class="panel__eyebrow">PURCHASE RECEIPTS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张入库单</h2>
        </div>
        <span class="table-panel__meta">金额以分存储，页面按元展示</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="入库单号" min-width="200">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.receiptNo }}</div>
            <div class="cell-secondary">创建 {{ formatDateTime(row.createdAt) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="仓库" min-width="170">
          <template #default="{ row }">
            <div class="mono-text">{{ row.warehouseNo }}</div>
            <div class="cell-secondary">{{ row.warehouseName }} · {{ factoryName(row.factoryId) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="供应商" min-width="150">
          <template #default="{ row }">{{ row.supplierName }}</template>
        </el-table-column>
        <el-table-column label="收货日期" width="120">
          <template #default="{ row }">{{ formatDate(row.receiptDate) }}</template>
        </el-table-column>
        <el-table-column label="入库金额" width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.totalAmount) }}</template>
        </el-table-column>
        <el-table-column label="明细" width="90" align="right">
          <template #default="{ row }">{{ (row.lines || []).length }} 行</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" effect="light">{{ purchaseReceiptStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">明细</el-button>
            <el-button v-if="canReceive(row)" link type="success" @click="handleReceive(row)">
              <el-icon><CircleCheck /></el-icon>收货
            </el-button>
            <el-button v-if="canCancel(row)" link type="danger" @click="handleCancel(row)">
              <el-icon><Close /></el-icon>取消
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无入库单" description="新建采购入库单，收货后库存会自动增加。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadReceipts() }"
          @current-change="(page) => { filters.page = page; loadReceipts() }"
        />
      </div>
    </section>

    <el-dialog v-model="createVisible" title="新建采购入库单" width="860px" destroy-on-close>
      <el-alert v-if="createError" type="error" :title="createError" :closable="false" show-icon class="section-alert" />
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="收货仓库" prop="warehouseId">
            <el-select v-model="createForm.warehouseId" filterable placeholder="选择仓库">
              <el-option
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName} · ${factoryName(warehouse.factoryId)}`"
                :value="String(warehouse.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="供应商" prop="supplierName">
            <el-input v-model="createForm.supplierName" placeholder="供应商名称" maxlength="200" />
          </el-form-item>
          <el-form-item label="收货日期" prop="receiptDate">
            <el-input v-model="createForm.receiptDate" type="date" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="createForm.remark" placeholder="可选" maxlength="500" />
          </el-form-item>
        </div>

        <div class="form-section-title">入库明细</div>
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

        <el-alert type="info" :closable="false" show-icon class="section-alert">
          <template #default>
            单价与损耗率取自物料档案，金额在收货时由服务端按“数量 × 单价”截断到分，前端不可指定价格。
          </template>
        </el-alert>

        <div class="form-actions">
          <el-button type="primary" :loading="createSaving" @click="submitCreate">
            <el-icon><Plus /></el-icon>创建入库单
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="入库单明细" width="760px" destroy-on-close>
      <template v-if="detailTarget">
        <p class="dialog-lead">
          {{ detailTarget.receiptNo }} · {{ detailTarget.warehouseNo }} · {{ detailTarget.supplierName }} ·
          合计 {{ formatMoney(detailTarget.totalAmount) }}
        </p>
        <el-table :data="detailTarget.lines || []" class="data-table" size="small">
          <el-table-column label="物料" min-width="180">
            <template #default="{ row }">
              <div class="mono-text">{{ row.materialCode }}</div>
              <div class="cell-secondary">{{ row.materialName }}</div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="110" align="right">
            <template #default="{ row }">{{ row.quantity }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column label="单价" width="110" align="right">
            <template #default="{ row }">{{ row.unitPrice }}</template>
          </el-table-column>
          <el-table-column label="损耗率" width="90" align="right">
            <template #default="{ row }">{{ row.lossRate ?? 0 }}%</template>
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
