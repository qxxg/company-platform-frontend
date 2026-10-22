<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Plus, Refresh, Search, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import CustomerSelect from '@/components/CustomerSelect.vue'
import { createReceivable, fetchReceivablePage } from '@/api/finance'
import { fetchContractPage } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney, yuanToCents } from '@/utils/money'
import {
  RECEIVABLE_STATUS,
  RECEIVABLE_STATUS_OPTIONS,
  receivableStatusLabel,
} from '@/constants'

/**
 * 应收账款列表（V1.4 页面矩阵 FIN-02）。
 *
 * 展示客户应收、账龄与逾期；金额全部由后端按分计算，前端只做展示和输入转换。
 * 正式应收由发货/开票自动生成，当前阶段提供财务手工补录入口。
 */
const auth = useAuthStore()

const filters = reactive({
  keyword: '',
  customerId: '',
  status: '',
  dueFrom: '',
  dueTo: '',
  page: 1,
  size: 10,
})

const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: {
    totalAmount: 0,
    receivedAmount: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    overdueCount: 0,
    openCount: 0,
    customerCount: 0,
  },
})
const loading = ref(false)
const loadError = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()
const contracts = ref([])
const contractsLoading = ref(false)

const form = reactive({
  customerId: '',
  contractId: '',
  orderNo: '',
  amountYuan: '',
  dueDate: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('finance:receivable:write'))
const hasFilters = computed(() =>
  Boolean(filters.keyword || filters.customerId || filters.status || filters.dueFrom || filters.dueTo),
)

const rules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  amountYuan: [
    { required: true, message: '请输入应收金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('应收金额必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('应收金额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
}

function statusTagType(value) {
  return RECEIVABLE_STATUS[value]?.type || 'info'
}

async function loadReceivables() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.customerId) params.customerId = filters.customerId
    if (filters.status) params.status = filters.status
    if (filters.dueFrom) params.dueFrom = filters.dueFrom
    if (filters.dueTo) params.dueTo = filters.dueTo
    const data = await fetchReceivablePage(params)
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
  loadReceivables()
}

function resetFilters() {
  filters.keyword = ''
  filters.customerId = ''
  filters.status = ''
  filters.dueFrom = ''
  filters.dueTo = ''
  filters.page = 1
  loadReceivables()
}

function openCreate() {
  Object.assign(form, {
    customerId: '',
    contractId: '',
    orderNo: '',
    amountYuan: '',
    dueDate: '',
    remark: '',
  })
  contracts.value = []
  formError.value = ''
  dialogVisible.value = true
}

/** 选定客户后加载可用于挂账的合同（已录入/生效）。 */
async function handleCustomerChange() {
  form.contractId = ''
  contracts.value = []
  if (!form.customerId) return
  contractsLoading.value = true
  try {
    const data = await fetchContractPage({ customerId: form.customerId, size: 100 })
    contracts.value = (data.records || []).filter((item) => ['ENTERED', 'ACTIVE'].includes(item.status))
  } catch {
    contracts.value = []
  } finally {
    contractsLoading.value = false
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
    await createReceivable({
      customerId: form.customerId,
      contractId: form.contractId || null,
      orderNo: form.orderNo.trim() || null,
      amount: yuanToCents(form.amountYuan),
      dueDate: form.dueDate || null,
      remark: form.remark.trim() || null,
    })
    ElMessage.success('应收已登记，信用占用同步更新')
    dialogVisible.value = false
    await loadReceivables()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(loadReceivables)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · RECEIVABLES"
      title="应收账款"
      description="按客户和合同管理应收、账龄与逾期；逾期超过 30 天会阻断下单和发货。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadReceivables">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>登记应收
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="应收口径">
      <template #default>
        应收金额以分存储、显示为元；账龄和逾期按“未收余额 + 到期日”实时计算，不落库。
        信用占用的另一半是已确认未发货订单，由订单服务单独汇总。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">应收总额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">已收 {{ formatMoney(pageData.summary.receivedAmount) }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber">
          <el-icon><Warning /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">未收余额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.outstandingAmount) }}</strong>
          <span class="metric-card__hint">{{ pageData.summary.openCount }} 笔未结清 · {{ pageData.summary.customerCount }} 个客户</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--red">
          <el-icon><Warning /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">逾期未收</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.overdueAmount) }}</strong>
          <span class="metric-card__hint">{{ pageData.summary.overdueCount }} 笔逾期</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="客户名称、编码或应收单号"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="客户">
          <CustomerSelect v-model="filters.customerId" placeholder="全部客户" @change="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in RECEIVABLE_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="到期日起">
          <el-date-picker v-model="filters.dueFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="到期日止">
          <el-date-picker v-model="filters.dueTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
        <span>“已逾期”是实时口径，等于未收余额大于 0 且到期日早于今天。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">ACCOUNTS RECEIVABLE</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 笔应收</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="应收单号" min-width="190">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.receivableNo }}</div>
            <div class="cell-secondary">{{ row.businessOwnerName || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.customerName || `客户 #${row.customerId}` }}</div>
            <div class="cell-secondary">{{ row.customerCode || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="合同 / 订单" min-width="170">
          <template #default="{ row }">
            <div>{{ row.contractNo || '—' }}</div>
            <div class="cell-secondary">{{ row.orderNo ? `订单 ${row.orderNo}` : '无关联订单' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="应收金额" min-width="140" align="right">
          <template #default="{ row }">{{ formatMoney(row.amount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="已收" min-width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.receivedAmount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="未收" min-width="140" align="right">
          <template #default="{ row }">
            <strong>{{ formatMoney(row.outstandingAmount, row.currency) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="到期日" width="120">
          <template #default="{ row }">{{ row.dueDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="账龄" min-width="140">
          <template #default="{ row }">
            <el-tag v-if="row.overdue" type="danger" effect="light">
              逾期 {{ row.overdueDays }} 天
            </el-tag>
            <span v-else class="cell-secondary">{{ row.agingBucket }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ receivableStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">
            <span class="cell-secondary">{{ row.remark || '—' }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无应收" description="请调整筛选条件，或由财务登记一笔应收。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadReceivables() }"
          @current-change="(page) => { filters.page = page; loadReceivables() }"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" title="登记应收" width="720px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="section-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="客户" prop="customerId">
            <CustomerSelect v-model="form.customerId" @change="handleCustomerChange" />
          </el-form-item>
          <el-form-item label="关联合同">
            <el-select
              v-model="form.contractId"
              :disabled="!form.customerId"
              :loading="contractsLoading"
              placeholder="可选，仅限该客户已录入/生效合同"
              clearable
            >
              <el-option
                v-for="contract in contracts"
                :key="contract.id"
                :label="`${contract.contractNo}（${formatMoney(contract.contractAmount, contract.currency)}）`"
                :value="String(contract.id)"
              />
            </el-select>
            <template #extra>
              <span class="field-hint">未关联合同的应收视为其他应收，信用占用同样生效。</span>
            </template>
          </el-form-item>
          <el-form-item label="关联订单号">
            <el-input v-model="form.orderNo" placeholder="可选，如 1928374655647382912" maxlength="20" />
          </el-form-item>
          <el-form-item label="应收金额（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="0.00" inputmode="decimal" />
            <template #extra>
              <span class="field-hint">金额按分截断保存，小数超过两位直接截去。</span>
            </template>
          </el-form-item>
          <el-form-item label="到期日">
            <el-date-picker v-model="form.dueDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            <template #extra><span class="field-hint">留空时按客户账期自动推算。</span></template>
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <el-alert type="warning" :closable="false" show-icon class="section-alert">
          <template #default>
            正式应收由发货/开票自动生成，这里用于补录和调整；保存后不可物理删除，只能作废。
          </template>
        </el-alert>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="submit">
            <el-icon><CircleCheck /></el-icon>保存应收
          </el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>
