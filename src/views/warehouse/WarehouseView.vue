<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Box, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  changeMaterialStatus,
  changeWarehouseStatus,
  createMaterial,
  createWarehouse,
  fetchInventoryPage,
  fetchMaterialPage,
  fetchMaterialOptions,
  fetchWarehouseOptions,
  fetchWarehousePage,
  updateMaterial,
  updateWarehouse,
} from '@/api/warehouse'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import {
  MATERIAL_TYPE,
  MATERIAL_TYPE_OPTIONS,
  WAREHOUSE_STATUS,
  WAREHOUSE_STATUS_OPTIONS,
  WAREHOUSE_TYPE,
  WAREHOUSE_TYPE_OPTIONS,
} from '@/constants'

/**
 * 仓储管理（V1.4 仓储系统）。
 *
 * 页面包含三个视图：仓库档案、物料档案和库存台账。规则口径与后端一致：
 * 每个工厂至少一个主仓；物料单价 4 位小数、损耗率 2 位小数；库存只能由采购
 * 入库和调拨入库增加，没有期初库存，页面不提供库存调整入口。
 */
const auth = useAuthStore()

const activeTab = ref('warehouses')
const factories = ref([])
const loading = ref(false)
const loadError = ref('')

const canManage = computed(() => auth.hasPermission('warehouse:manage'))
const isFactoryManager = computed(() => auth.roles.includes('FACTORY_MANAGER'))

const visibleFactories = computed(() => {
  if (!isFactoryManager.value) return factories.value
  return factories.value.filter((item) => String(item.id) === String(auth.factoryId))
})

// ---------------------------------------------------------------- 仓库档案

const warehouseRows = ref([])
const warehouseTotal = ref(0)
const warehouseFilters = reactive({ keyword: '', factoryId: '', status: '', page: 1, size: 10 })

const warehouseDialog = ref(false)
const warehouseSaving = ref(false)
const warehouseError = ref('')
const warehouseFormRef = ref()
const warehouseEditingId = ref(null)
const warehouseForm = reactive({
  warehouseNo: '',
  warehouseName: '',
  factoryId: '',
  warehouseType: 'MAIN',
  address: '',
  managerUserId: '',
  remark: '',
})

const warehouseRules = {
  warehouseNo: [
    { required: true, message: '请输入仓库编号', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,64}$/,
      message: '仓库编号只能包含字母、数字、下划线和短横线',
      trigger: 'blur',
    },
  ],
  warehouseName: [{ required: true, message: '请输入仓库名称', trigger: 'blur' }],
  factoryId: [{ required: true, message: '请选择所属工厂', trigger: 'change' }],
  warehouseType: [{ required: true, message: '请选择仓库类型', trigger: 'change' }],
}

// ---------------------------------------------------------------- 物料档案

const materialRows = ref([])
const materialTotal = ref(0)
const materialFilters = reactive({ keyword: '', materialType: '', status: '', page: 1, size: 10 })
const materialOptions = ref([])

const materialDialog = ref(false)
const materialSaving = ref(false)
const materialError = ref('')
const materialFormRef = ref()
const materialEditingId = ref(null)
const materialForm = reactive({
  materialCode: '',
  materialName: '',
  materialType: 'FABRIC',
  spec: '',
  unit: '米',
  unitPrice: '',
  lossRate: '0.00',
  safetyStock: '0.00',
  remark: '',
})

const materialRules = {
  materialCode: [
    { required: true, message: '请输入物料编码', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,64}$/,
      message: '物料编码只能包含字母、数字、下划线和短横线',
      trigger: 'blur',
    },
  ],
  materialName: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
  unit: [{ required: true, message: '请输入计量单位', trigger: 'blur' }],
  unitPrice: [
    { required: true, message: '请输入采购单价', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const text = String(value).trim()
        if (!/^\d+(\.\d{1,4})?$/.test(text)) {
          callback(new Error('单价最多 4 位小数'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  lossRate: [
    {
      validator: (_rule, value, callback) => {
        const text = String(value).trim()
        if (!/^\d+(\.\d{1,2})?$/.test(text)) {
          callback(new Error('损耗率最多 2 位小数'))
          return
        }
        if (Number(text) > 100) {
          callback(new Error('损耗率必须在 0–100 之间'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

// ---------------------------------------------------------------- 库存台账

const inventoryRows = ref([])
const inventoryTotal = ref(0)
const inventoryFilters = reactive({
  warehouseId: '',
  materialId: '',
  keyword: '',
  belowSafety: false,
  page: 1,
  size: 10,
})
const warehouseOptions = ref([])

// ---------------------------------------------------------------- 数据加载

function factoryName(factoryId) {
  const match = factories.value.find((item) => String(item.id) === String(factoryId))
  return match?.name || (factoryId ? `工厂 #${factoryId}` : '—')
}

function warehouseTypeTag(value) {
  return WAREHOUSE_TYPE[value]?.type || 'info'
}

function materialTypeTag(value) {
  return MATERIAL_TYPE[value]?.type || 'info'
}

function statusTag(value) {
  return WAREHOUSE_STATUS[value]?.type || 'info'
}

async function loadFactories() {
  if (!auth.hasPermission('system:factory:list')) return
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
}

async function loadWarehouses() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: warehouseFilters.page, size: warehouseFilters.size }
    if (warehouseFilters.keyword.trim()) params.keyword = warehouseFilters.keyword.trim()
    if (warehouseFilters.factoryId) params.factoryId = warehouseFilters.factoryId
    if (warehouseFilters.status) params.status = warehouseFilters.status
    const data = await fetchWarehousePage(params)
    warehouseRows.value = data.records || []
    warehouseTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = errorMessage(error)
    warehouseRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadMaterials() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: materialFilters.page, size: materialFilters.size }
    if (materialFilters.keyword.trim()) params.keyword = materialFilters.keyword.trim()
    if (materialFilters.materialType) params.materialType = materialFilters.materialType
    if (materialFilters.status) params.status = materialFilters.status
    const data = await fetchMaterialPage(params)
    materialRows.value = data.records || []
    materialTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = errorMessage(error)
    materialRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadInventory() {
  loading.value = true
  loadError.value = ''
  try {
    const params = {
      page: inventoryFilters.page,
      size: inventoryFilters.size,
      belowSafety: inventoryFilters.belowSafety,
    }
    if (inventoryFilters.warehouseId) params.warehouseId = inventoryFilters.warehouseId
    if (inventoryFilters.materialId) params.materialId = inventoryFilters.materialId
    if (inventoryFilters.keyword.trim()) params.keyword = inventoryFilters.keyword.trim()
    const data = await fetchInventoryPage(params)
    inventoryRows.value = data.records || []
    inventoryTotal.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = errorMessage(error)
    inventoryRows.value = []
  } finally {
    loading.value = false
  }
}

async function loadOptions() {
  try {
    warehouseOptions.value = (await fetchWarehouseOptions()) || []
  } catch {
    warehouseOptions.value = []
  }
  try {
    materialOptions.value = (await fetchMaterialOptions()) || []
  } catch {
    materialOptions.value = []
  }
}

function refreshCurrent() {
  if (activeTab.value === 'warehouses') return loadWarehouses()
  if (activeTab.value === 'materials') return loadMaterials()
  return loadInventory()
}

function handleTabChange() {
  loadError.value = ''
  refreshCurrent()
}

// ---------------------------------------------------------------- 仓库操作

function openWarehouseCreate() {
  warehouseEditingId.value = null
  Object.assign(warehouseForm, {
    warehouseNo: '',
    warehouseName: '',
    factoryId: isFactoryManager.value && auth.factoryId ? String(auth.factoryId) : '',
    warehouseType: 'MAIN',
    address: '',
    managerUserId: '',
    remark: '',
  })
  warehouseError.value = ''
  warehouseDialog.value = true
}

function openWarehouseEdit(row) {
  warehouseEditingId.value = row.id
  Object.assign(warehouseForm, {
    warehouseNo: row.warehouseNo,
    warehouseName: row.warehouseName,
    factoryId: String(row.factoryId || ''),
    warehouseType: row.warehouseType,
    address: row.address || '',
    managerUserId: row.managerUserId ? String(row.managerUserId) : '',
    remark: row.remark || '',
  })
  warehouseError.value = ''
  warehouseDialog.value = true
}

async function submitWarehouse() {
  warehouseError.value = ''
  try {
    await warehouseFormRef.value.validate()
  } catch {
    return
  }
  warehouseSaving.value = true
  try {
    const payload = {
      warehouseName: warehouseForm.warehouseName.trim(),
      warehouseType: warehouseForm.warehouseType,
      address: warehouseForm.address.trim() || null,
      managerUserId: warehouseForm.managerUserId ? Number(warehouseForm.managerUserId) : null,
      remark: warehouseForm.remark.trim() || null,
    }
    if (warehouseEditingId.value === null) {
      await createWarehouse({
        ...payload,
        warehouseNo: warehouseForm.warehouseNo.trim().toUpperCase(),
        factoryId: warehouseForm.factoryId,
      })
      ElMessage.success('仓库已创建')
    } else {
      await updateWarehouse(warehouseEditingId.value, payload)
      ElMessage.success('仓库已更新')
    }
    warehouseDialog.value = false
    await Promise.all([loadWarehouses(), loadOptions()])
  } catch (error) {
    warehouseError.value = errorMessage(error)
  } finally {
    warehouseSaving.value = false
  }
}

async function toggleWarehouseStatus(row) {
  const target = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try {
    await ElMessageBox.confirm(
      target === 'DISABLED'
        ? `确认停用仓库 ${row.warehouseNo}？仓库仍有库存时无法停用。`
        : `确认启用仓库 ${row.warehouseNo}？`,
      '变更仓库状态',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await changeWarehouseStatus(row.id, target)
    ElMessage.success('仓库状态已更新')
    await Promise.all([loadWarehouses(), loadOptions()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

// ---------------------------------------------------------------- 物料操作

function openMaterialCreate() {
  materialEditingId.value = null
  Object.assign(materialForm, {
    materialCode: '',
    materialName: '',
    materialType: 'FABRIC',
    spec: '',
    unit: '米',
    unitPrice: '',
    lossRate: '0.00',
    safetyStock: '0.00',
    remark: '',
  })
  materialError.value = ''
  materialDialog.value = true
}

function openMaterialEdit(row) {
  materialEditingId.value = row.id
  Object.assign(materialForm, {
    materialCode: row.materialCode,
    materialName: row.materialName,
    materialType: row.materialType,
    spec: row.spec || '',
    unit: row.unit,
    unitPrice: row.unitPrice != null ? String(row.unitPrice) : '',
    lossRate: row.lossRate != null ? String(row.lossRate) : '0.00',
    safetyStock: row.safetyStock != null ? String(row.safetyStock) : '0.00',
    remark: row.remark || '',
  })
  materialError.value = ''
  materialDialog.value = true
}

async function submitMaterial() {
  materialError.value = ''
  try {
    await materialFormRef.value.validate()
  } catch {
    return
  }
  materialSaving.value = true
  try {
    const payload = {
      materialName: materialForm.materialName.trim(),
      materialType: materialForm.materialType,
      spec: materialForm.spec.trim() || null,
      unit: materialForm.unit.trim(),
      unitPrice: materialForm.unitPrice,
      lossRate: materialForm.lossRate === '' ? '0.00' : materialForm.lossRate,
      safetyStock: materialForm.safetyStock === '' ? '0.00' : materialForm.safetyStock,
      remark: materialForm.remark.trim() || null,
    }
    if (materialEditingId.value === null) {
      await createMaterial({
        ...payload,
        materialCode: materialForm.materialCode.trim().toUpperCase(),
      })
      ElMessage.success('物料已创建')
    } else {
      await updateMaterial(materialEditingId.value, payload)
      ElMessage.success('物料已更新')
    }
    materialDialog.value = false
    await Promise.all([loadMaterials(), loadOptions()])
  } catch (error) {
    materialError.value = errorMessage(error)
  } finally {
    materialSaving.value = false
  }
}

async function toggleMaterialStatus(row) {
  const target = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try {
    await ElMessageBox.confirm(
      target === 'DISABLED'
        ? `确认停用物料 ${row.materialCode}？仍有库存时无法停用。`
        : `确认启用物料 ${row.materialCode}？`,
      '变更物料状态',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await changeMaterialStatus(row.id, target)
    ElMessage.success('物料状态已更新')
    await Promise.all([loadMaterials(), loadOptions()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(async () => {
  await Promise.all([loadFactories(), loadOptions()])
  await loadWarehouses()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="WAREHOUSE · INVENTORY"
      title="仓储管理"
      description="维护仓库与物料档案、查看库存台账；库存只能通过采购入库和调拨入库增加，没有期初库存。"
    >
      <template #actions>
        <el-button :loading="loading" @click="refreshCurrent">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canManage && activeTab === 'warehouses'" type="primary" @click="openWarehouseCreate">
          <el-icon><Plus /></el-icon>新建仓库
        </el-button>
        <el-button v-if="canManage && activeTab === 'materials'" type="primary" @click="openMaterialCreate">
          <el-icon><Plus /></el-icon>新建物料
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="仓储口径">
      <template #default>
        每个工厂至少保留一个启用主仓，仓库不跨厂，跨厂移库走调拨单；物料单价最多 4 位小数、损耗率 2 位小数，
        数量统一 2 位小数并截断。库存台账只读，不提供库存调整入口。
      </template>
    </el-alert>

    <el-tabs v-model="activeTab" class="warehouse-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="仓库档案" name="warehouses">
        <section class="panel filter-panel">
          <el-form :model="warehouseFilters" class="filter-form" label-position="top" @submit.prevent="loadWarehouses">
            <el-form-item label="关键字">
              <el-input
                v-model="warehouseFilters.keyword"
                placeholder="仓库编号或名称"
                clearable
                @keyup.enter="loadWarehouses"
              />
            </el-form-item>
            <el-form-item label="工厂">
              <el-select v-model="warehouseFilters.factoryId" placeholder="全部工厂" clearable>
                <el-option
                  v-for="factory in visibleFactories"
                  :key="factory.id"
                  :label="factory.name"
                  :value="String(factory.id)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="warehouseFilters.status" placeholder="全部状态" clearable>
                <el-option
                  v-for="item in WAREHOUSE_STATUS_OPTIONS"
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
              <span class="panel__eyebrow">WAREHOUSES</span>
              <h2>共 {{ warehouseTotal.toLocaleString('zh-CN') }} 个仓库</h2>
            </div>
            <span class="table-panel__meta">主仓：每个工厂至少一个</span>
          </div>

          <el-table v-loading="loading" :data="warehouseRows" class="data-table" row-key="id">
            <el-table-column label="仓库编号 / 名称" min-width="200">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.warehouseNo }}</div>
                <div class="cell-secondary">{{ row.warehouseName }}</div>
              </template>
            </el-table-column>
            <el-table-column label="工厂" min-width="120">
              <template #default="{ row }">{{ factoryName(row.factoryId) }}</template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag :type="warehouseTypeTag(row.warehouseType)" size="small" effect="plain">
                  {{ WAREHOUSE_TYPE[row.warehouseType]?.label || row.warehouseType }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="地址 / 负责人" min-width="180">
              <template #default="{ row }">
                <div>{{ row.address || '—' }}</div>
                <div class="cell-secondary">{{ row.managerName || '未指定负责人' }}</div>
              </template>
            </el-table-column>
            <el-table-column label="库存" min-width="140" align="right">
              <template #default="{ row }">
                <div>{{ row.quantityTotal ?? 0 }}</div>
                <div class="cell-secondary">{{ row.materialCount ?? 0 }} 种物料</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusTag(row.status)" effect="light">
                  {{ WAREHOUSE_STATUS[row.status]?.label || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openWarehouseEdit(row)">
                  <el-icon><Edit /></el-icon>编辑
                </el-button>
                <el-button link :type="row.status === 'ACTIVE' ? 'warning' : 'success'" @click="toggleWarehouseStatus(row)">
                  {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无仓库" description="每个工厂至少需要一个主仓，请先新建仓库档案。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="warehouseTotal"
              :current-page="warehouseFilters.page"
              :page-size="warehouseFilters.size"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { warehouseFilters.size = size; warehouseFilters.page = 1; loadWarehouses() }"
              @current-change="(page) => { warehouseFilters.page = page; loadWarehouses() }"
            />
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="物料档案" name="materials">
        <section class="panel filter-panel">
          <el-form :model="materialFilters" class="filter-form" label-position="top" @submit.prevent="loadMaterials">
            <el-form-item label="关键字">
              <el-input
                v-model="materialFilters.keyword"
                placeholder="物料编码、名称或规格"
                clearable
                @keyup.enter="loadMaterials"
              />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="materialFilters.materialType" placeholder="全部类型" clearable>
                <el-option
                  v-for="item in MATERIAL_TYPE_OPTIONS"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="materialFilters.status" placeholder="全部状态" clearable>
                <el-option label="启用" value="ACTIVE" />
                <el-option label="停用" value="DISABLED" />
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
              <span class="panel__eyebrow">MATERIALS</span>
              <h2>共 {{ materialTotal.toLocaleString('zh-CN') }} 种物料</h2>
            </div>
            <span class="table-panel__meta">单价 4 位小数 · 损耗率 2 位小数</span>
          </div>

          <el-table v-loading="loading" :data="materialRows" class="data-table" row-key="id">
            <el-table-column label="物料编码 / 名称" min-width="200">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.materialCode }}</div>
                <div class="cell-secondary">{{ row.materialName }}</div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="100">
              <template #default="{ row }">
                <el-tag :type="materialTypeTag(row.materialType)" size="small" effect="plain">
                  {{ MATERIAL_TYPE[row.materialType]?.label || row.materialType }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="规格" min-width="200">
              <template #default="{ row }">{{ row.spec || '—' }}</template>
            </el-table-column>
            <el-table-column label="单位" width="80">
              <template #default="{ row }">{{ row.unit }}</template>
            </el-table-column>
            <el-table-column label="采购单价" width="120" align="right">
              <template #default="{ row }">{{ row.unitPrice ?? '0.0000' }}</template>
            </el-table-column>
            <el-table-column label="损耗率" width="100" align="right">
              <template #default="{ row }">{{ row.lossRate ?? 0 }}%</template>
            </el-table-column>
            <el-table-column label="安全库存" width="110" align="right">
              <template #default="{ row }">{{ row.safetyStock ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="库存合计" width="120" align="right">
              <template #default="{ row }">
                <strong>{{ row.stockQuantity ?? 0 }}</strong>
                <div class="cell-secondary">{{ row.unit }}</div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="light">
                  {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="canManage" label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openMaterialEdit(row)">
                  <el-icon><Edit /></el-icon>编辑
                </el-button>
                <el-button link :type="row.status === 'ACTIVE' ? 'warning' : 'success'" @click="toggleMaterialStatus(row)">
                  {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无物料" description="先建立物料档案，采购入库和库存才有基础数据。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="materialTotal"
              :current-page="materialFilters.page"
              :page-size="materialFilters.size"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { materialFilters.size = size; materialFilters.page = 1; loadMaterials() }"
              @current-change="(page) => { materialFilters.page = page; loadMaterials() }"
            />
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="库存台账" name="inventory">
        <section class="panel filter-panel">
          <el-form :model="inventoryFilters" class="filter-form" label-position="top" @submit.prevent="loadInventory">
            <el-form-item label="仓库">
              <el-select v-model="inventoryFilters.warehouseId" placeholder="全部仓库" clearable filterable>
                <el-option
                  v-for="warehouse in warehouseOptions"
                  :key="warehouse.id"
                  :label="`${warehouse.warehouseNo} · ${warehouse.warehouseName}`"
                  :value="String(warehouse.id)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="物料">
              <el-select v-model="inventoryFilters.materialId" placeholder="全部物料" clearable filterable>
                <el-option
                  v-for="material in materialOptions"
                  :key="material.id"
                  :label="`${material.materialCode} · ${material.materialName}`"
                  :value="String(material.id)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="关键字">
              <el-input
                v-model="inventoryFilters.keyword"
                placeholder="物料编码或名称"
                clearable
                @keyup.enter="loadInventory"
              />
            </el-form-item>
            <el-form-item label="低于安全库存">
              <el-switch v-model="inventoryFilters.belowSafety" @change="loadInventory" />
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
              <span class="panel__eyebrow">INVENTORY</span>
              <h2>共 {{ inventoryTotal.toLocaleString('zh-CN') }} 条库存记录</h2>
            </div>
            <span class="table-panel__meta">库存只读，由采购入库与调拨驱动</span>
          </div>

          <el-table v-loading="loading" :data="inventoryRows" class="data-table" row-key="id">
            <el-table-column label="仓库" min-width="180">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.warehouseNo }}</div>
                <div class="cell-secondary">{{ row.warehouseName }} · {{ factoryName(row.factoryId) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="物料" min-width="190">
              <template #default="{ row }">
                <div class="cell-primary mono-text">{{ row.materialCode }}</div>
                <div class="cell-secondary">{{ row.materialName }}</div>
              </template>
            </el-table-column>
            <el-table-column label="当前库存" width="130" align="right">
              <template #default="{ row }">
                <strong>{{ row.quantity ?? 0 }}</strong>
                <div class="cell-secondary">{{ row.unit }}</div>
              </template>
            </el-table-column>
            <el-table-column label="安全库存" width="120" align="right">
              <template #default="{ row }">{{ row.safetyStock ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="库存状态" width="130">
              <template #default="{ row }">
                <el-tag :type="row.belowSafety ? 'danger' : 'success'" effect="light">
                  {{ row.belowSafety ? '低于安全库存' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" min-width="170">
              <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
            </el-table-column>
            <template #empty>
              <EmptyState title="暂无库存" description="库存来自采购入库与调拨入库，尚无记录。" />
            </template>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              background
              layout="sizes, prev, pager, next, total"
              :total="inventoryTotal"
              :current-page="inventoryFilters.page"
              :page-size="inventoryFilters.size"
              :page-sizes="[10, 20, 50, 100]"
              @size-change="(size) => { inventoryFilters.size = size; inventoryFilters.page = 1; loadInventory() }"
              @current-change="(page) => { inventoryFilters.page = page; loadInventory() }"
            />
          </div>
        </section>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="warehouseDialog"
      :title="warehouseEditingId === null ? '新建仓库' : '编辑仓库'"
      width="680px"
      destroy-on-close
    >
      <el-alert v-if="warehouseError" type="error" :title="warehouseError" :closable="false" show-icon class="section-alert" />
      <el-form ref="warehouseFormRef" :model="warehouseForm" :rules="warehouseRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="仓库编号" prop="warehouseNo">
            <el-input
              v-model="warehouseForm.warehouseNo"
              :disabled="warehouseEditingId !== null"
              placeholder="例如 WH-F001-02"
              maxlength="64"
            />
            <template #extra><span class="field-hint">全公司唯一；创建后不可修改。</span></template>
          </el-form-item>
          <el-form-item label="仓库名称" prop="warehouseName">
            <el-input v-model="warehouseForm.warehouseName" placeholder="例如 印花车间备料仓" maxlength="128" />
          </el-form-item>
          <el-form-item label="所属工厂" prop="factoryId">
            <el-select v-model="warehouseForm.factoryId" :disabled="warehouseEditingId !== null" placeholder="请选择工厂">
              <el-option
                v-for="factory in visibleFactories"
                :key="factory.id"
                :label="factory.name"
                :value="String(factory.id)"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="仓库类型" prop="warehouseType">
            <el-select v-model="warehouseForm.warehouseType">
              <el-option v-for="item in WAREHOUSE_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
            <template #extra><span class="field-hint">每个工厂只能有一个启用主仓。</span></template>
          </el-form-item>
          <el-form-item label="仓库地址" class="form-grid__full">
            <el-input v-model="warehouseForm.address" placeholder="可选" maxlength="255" />
          </el-form-item>
          <el-form-item label="负责人用户 ID" class="form-grid__full">
            <el-input v-model="warehouseForm.managerUserId" placeholder="可选，填写平台用户 ID" />
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="warehouseForm.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="warehouseSaving" @click="submitWarehouse">
            {{ warehouseEditingId === null ? '创建仓库' : '保存修改' }}
          </el-button>
          <el-button @click="warehouseDialog = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog
      v-model="materialDialog"
      :title="materialEditingId === null ? '新建物料' : '编辑物料'"
      width="720px"
      destroy-on-close
    >
      <el-alert v-if="materialError" type="error" :title="materialError" :closable="false" show-icon class="section-alert" />
      <el-form ref="materialFormRef" :model="materialForm" :rules="materialRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="物料编码" prop="materialCode">
            <el-input
              v-model="materialForm.materialCode"
              :disabled="materialEditingId !== null"
              placeholder="例如 MAT-COTTON-128"
              maxlength="64"
            />
            <template #extra><span class="field-hint">全公司唯一；创建后不可修改。</span></template>
          </el-form-item>
          <el-form-item label="物料名称" prop="materialName">
            <el-input v-model="materialForm.materialName" placeholder="例如 全棉坯布 128 支" maxlength="128" />
          </el-form-item>
          <el-form-item label="物料类型">
            <el-select v-model="materialForm.materialType">
              <el-option v-for="item in MATERIAL_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="计量单位" prop="unit">
            <el-input v-model="materialForm.unit" placeholder="米 / 公斤 / 卷 / 件" maxlength="16" />
          </el-form-item>
          <el-form-item label="规格" class="form-grid__full">
            <el-input v-model="materialForm.spec" placeholder="例如 幅宽 1500mm / 128 支 / 100% 棉" maxlength="255" />
          </el-form-item>
          <el-form-item label="采购单价" prop="unitPrice">
            <el-input v-model="materialForm.unitPrice" placeholder="例如 18.5000" inputmode="decimal" />
            <template #extra><span class="field-hint">最多 4 位小数，超出部分截断。</span></template>
          </el-form-item>
          <el-form-item label="损耗率（%）" prop="lossRate">
            <el-input v-model="materialForm.lossRate" placeholder="例如 2.50" inputmode="decimal" />
            <template #extra><span class="field-hint">最多 2 位小数，范围 0–100。</span></template>
          </el-form-item>
          <el-form-item label="安全库存" prop="safetyStock">
            <el-input v-model="materialForm.safetyStock" placeholder="例如 5000.00" inputmode="decimal" />
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="materialForm.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="materialSaving" @click="submitMaterial">
            {{ materialEditingId === null ? '创建物料' : '保存修改' }}
          </el-button>
          <el-button @click="materialDialog = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>

<style scoped>
.warehouse-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
</style>
