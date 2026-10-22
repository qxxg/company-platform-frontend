<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  changeApprovalDefinitionStatus,
  createApprovalDefinition,
  fetchApprovalDefinitionPage,
  updateApprovalDefinition,
} from '@/api/approval'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import { APPROVAL_BUSINESS_TYPE_OPTIONS } from '@/constants'

/**
 * 审批流程与金额档位配置。
 *
 * 按 V1.4 规则，审批档位由财务在系统上线前配置：同一业务类型可配置多档，按
 * “下限含、上限不含”匹配，优先级数字小的先命中。只有管理员和财务可以维护。
 */
const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const records = ref([])
const total = ref(0)
const filters = reactive({ businessType: '', page: 1, size: 10 })

const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()
const editingId = ref(null)
const form = reactive({
  businessType: 'CREDIT_LIMIT',
  name: '',
  amountMinYuan: '0.00',
  amountMaxYuan: '',
  approverRole: '',
  approverUserId: '',
  priority: 10,
  remark: '',
})

const canManage = computed(() => auth.hasPermission('approval:manage'))

async function loadDefinitions() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.businessType) params.businessType = filters.businessType
    const data = await fetchApprovalDefinitionPage(params)
    records.value = data.records || []
    total.value = Number(data.total || 0)
  } catch (error) {
    loadError.value = errorMessage(error)
    records.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    businessType: 'CREDIT_LIMIT',
    name: '',
    amountMinYuan: '0.00',
    amountMaxYuan: '',
    approverRole: '',
    approverUserId: '',
    priority: 10,
    remark: '',
  })
  formError.value = ''
  dialogVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    businessType: row.businessType,
    name: row.name,
    amountMinYuan: row.amountMin == null ? '0.00' : String(row.amountMin / 100),
    amountMaxYuan: row.amountMax == null ? '' : String(row.amountMax / 100),
    approverRole: row.approverRole || '',
    approverUserId: row.approverUserId ? String(row.approverUserId) : '',
    priority: row.priority,
    remark: row.remark || '',
  })
  formError.value = ''
  dialogVisible.value = true
}

function yuanToCents(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error('金额格式不正确')
  }
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
}

async function submit() {
  formError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  let amountMin = 0
  let amountMax = null
  try {
    amountMin = yuanToCents(form.amountMinYuan)
    amountMax = form.amountMaxYuan === '' ? null : yuanToCents(form.amountMaxYuan)
  } catch (error) {
    formError.value = error.message
    return
  }
  if (amountMax !== null && amountMax <= amountMin) {
    formError.value = '金额上限必须大于金额下限'
    return
  }
  if (!form.approverRole.trim() && !form.approverUserId.trim()) {
    formError.value = '审批角色和指定审批人至少填写一项'
    return
  }
  saving.value = true
  try {
    const payload = {
      businessType: form.businessType,
      name: form.name.trim(),
      amountMin,
      amountMax,
      approverRole: form.approverRole.trim() || null,
      approverUserId: form.approverUserId ? Number(form.approverUserId) : null,
      priority: Number(form.priority || 10),
      remark: form.remark.trim() || null,
    }
    if (editingId.value === null) {
      await createApprovalDefinition(payload)
      ElMessage.success('审批流程已创建')
    } else {
      await updateApprovalDefinition(editingId.value, payload)
      ElMessage.success('审批流程已更新')
    }
    dialogVisible.value = false
    await loadDefinitions()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  const target = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try {
    await ElMessageBox.confirm(
      target === 'DISABLED' ? '确认停用该审批流程？停用后该档位不再匹配新申请。' : '确认启用该审批流程？',
      '变更审批流程状态',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await changeApprovalDefinitionStatus(row.id, target)
    ElMessage.success('审批流程状态已更新')
    await loadDefinitions()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(loadDefinitions)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="APPROVAL · DEFINITION"
      title="审批流程与档位"
      description="按业务类型与金额区间配置审批人；金额档位由财务在上线前维护，优先级数字小的先命中。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadDefinitions">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canManage" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建流程
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="warning" :closable="false" show-icon class="section-alert" title="档位口径">
      <template #default>
        金额按“下限含、上限不含”匹配，上限留空表示不封顶；同一业务类型可配置多档，
        优先级数字小的先命中。审批流程只允许停用，不做物理删除，避免历史申请失去依据。
      </template>
    </el-alert>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="loadDefinitions">
        <el-form-item label="业务类型">
          <el-select v-model="filters.businessType" placeholder="全部类型" clearable>
            <el-option
              v-for="item in APPROVAL_BUSINESS_TYPE_OPTIONS"
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
          <span class="panel__eyebrow">APPROVAL DEFINITIONS</span>
          <h2>共 {{ total.toLocaleString('zh-CN') }} 条审批流程</h2>
        </div>
        <span class="table-panel__meta">金额区间以元展示，服务端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="records" class="data-table" row-key="id">
        <el-table-column label="业务类型" width="150">
          <template #default="{ row }">{{ row.businessType }}</template>
        </el-table-column>
        <el-table-column label="流程名称" min-width="220">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.name }}</div>
            <div v-if="row.remark" class="cell-secondary">{{ row.remark }}</div>
          </template>
        </el-table-column>
        <el-table-column label="金额区间" min-width="200" align="right">
          <template #default="{ row }">
            <div>{{ formatMoney(row.amountMin) }} ≤ 金额</div>
            <div class="cell-secondary">
              {{ row.amountMax == null ? '不封顶' : `< ${formatMoney(row.amountMax)}` }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="审批人" min-width="150">
          <template #default="{ row }">
            <div>{{ row.approverRole || `用户 #${row.approverUserId}` }}</div>
            <div v-if="row.approverRole && row.approverUserId" class="cell-secondary">同时指定用户 #{{ row.approverUserId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="90" align="right">
          <template #default="{ row }">{{ row.priority }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" effect="light">
              {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="170">
          <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column v-if="canManage" label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>编辑
            </el-button>
            <el-button link :type="row.status === 'ACTIVE' ? 'warning' : 'success'" @click="toggleStatus(row)">
              {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无审批流程" description="至少为每个业务类型配置一条审批流程，否则申请无法提交。" />
        </template>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          background
          layout="sizes, prev, pager, next, total"
          :total="total"
          :current-page="filters.page"
          :page-size="filters.size"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="(size) => { filters.size = size; filters.page = 1; loadDefinitions() }"
          @current-change="(page) => { filters.page = page; loadDefinitions() }"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId === null ? '新建审批流程' : '编辑审批流程'" width="720px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="section-alert" />
      <el-form ref="formRef" :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="业务类型">
            <el-select v-model="form.businessType">
              <el-option
                v-for="item in APPROVAL_BUSINESS_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="流程名称">
            <el-input v-model="form.name" placeholder="例如 信用额度调整审批" maxlength="128" />
          </el-form-item>
          <el-form-item label="金额下限（元）">
            <el-input v-model="form.amountMinYuan" inputmode="decimal" placeholder="0.00" />
            <template #extra><span class="field-hint">含下限，最多 2 位小数。</span></template>
          </el-form-item>
          <el-form-item label="金额上限（元）">
            <el-input v-model="form.amountMaxYuan" inputmode="decimal" placeholder="留空表示不封顶" />
          </el-form-item>
          <el-form-item label="审批角色">
            <el-input v-model="form.approverRole" placeholder="例如 FINANCE（与指定审批人二选一）" maxlength="32" />
          </el-form-item>
          <el-form-item label="指定审批人用户 ID">
            <el-input v-model="form.approverUserId" placeholder="可选" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-input v-model="form.priority" type="number" min="1" />
            <template #extra><span class="field-hint">数字小的先匹配。</span></template>
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="submit">
            {{ editingId === null ? '创建流程' : '保存修改' }}
          </el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>
