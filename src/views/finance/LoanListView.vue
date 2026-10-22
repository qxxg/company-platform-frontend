<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Coin, Plus, Refresh, Search, Wallet } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  cancelLoan,
  createLoan,
  disburseLoan,
  fetchLoan,
  fetchLoanPage,
  repayLoan,
  submitLoan,
} from '@/api/finance'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { centsToYuan, formatMoney, yuanToCents } from '@/utils/money'

/**
 * 借款与还款（V1.4 财务 8.5）。
 *
 * 流程：员工建借款草稿 → 提交审批（≤5000 元厂长审批，>5000 元财务审批）→
 * 待放款 → 财务放款 → 还款中 → 已还清。还款支持手工登记；报销付款时的
 * 借款冲销会在还款记录中显示为“报销冲销”。
 */
const auth = useAuthStore()

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '待放款' },
  { value: 'DISBURSED', label: '还款中' },
  { value: 'REPAID', label: '已还清' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'CANCELLED', label: '已取消' },
]

const filters = reactive({
  keyword: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  size: 10,
})

const pageData = ref({
  records: [],
  total: 0,
  pageNumber: 1,
  pageSize: 10,
  summary: {
    count: 0,
    activeCount: 0,
    repaidCount: 0,
    totalAmount: 0,
    outstandingAmount: 0,
    repaidAmount: 0,
  },
})
const loading = ref(false)
const loadError = ref('')
const factories = ref([])

const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const actionVisible = ref(false)
const actionBusy = ref(false)
const actionError = ref('')
const actionTarget = ref(null)
const actionMode = ref('disburse')
const actionForm = reactive({
  method: 'TRANSFER',
  amountYuan: '',
  repaymentDate: todayIso(),
  remark: '',
})

const form = reactive({
  amountYuan: '',
  loanDate: todayIso(),
  purpose: '',
  expectedRepayDate: '',
  factoryId: '',
  department: '',
})

const canWrite = computed(() => auth.hasPermission('finance:loan:write'))
const canDisburse = computed(() => auth.hasPermission('finance:loan:disburse'))
const canRepay = computed(() => auth.hasPermission('finance:loan:repay'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.status || filters.dateFrom || filters.dateTo))
const isDisburse = computed(() => actionMode.value === 'disburse')

const rules = {
  amountYuan: [
    { required: true, message: '请输入借款金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('借款金额必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('借款金额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
  loanDate: [{ required: true, message: '请选择借款日期', trigger: 'change' }],
  purpose: [{ required: true, message: '请填写借款用途', trigger: 'blur' }],
}

function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function factoryLabel(value) {
  if (!value) return '—'
  const match = factories.value.find((item) => String(item.id) === String(value))
  return match ? match.name : `工厂 #${value}`
}

function statusTagType(status) {
  return {
    DRAFT: 'info',
    PENDING: 'warning',
    APPROVED: 'primary',
    DISBURSED: 'primary',
    REPAID: 'success',
    REJECTED: 'danger',
    CANCELLED: 'info',
  }[status] || 'info'
}

function isOwner(row) {
  return String(row.borrowerUserId) === String(auth.userId)
}

function canSubmit(row) {
  return canWrite.value && ['DRAFT', 'REJECTED'].includes(row.status) && (isOwner(row) || canDisburse.value)
}

function canCancel(row) {
  return canWrite.value && ['DRAFT', 'PENDING'].includes(row.status) && (isOwner(row) || canDisburse.value)
}

async function loadLoans() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    if (filters.dateFrom) params.dateFrom = filters.dateFrom
    if (filters.dateTo) params.dateTo = filters.dateTo
    const data = await fetchLoanPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
      summary: {
        count: Number(data.summary?.count || 0),
        activeCount: Number(data.summary?.activeCount || 0),
        repaidCount: Number(data.summary?.repaidCount || 0),
        totalAmount: data.summary?.totalAmount || 0,
        outstandingAmount: data.summary?.outstandingAmount || 0,
        repaidAmount: data.summary?.repaidAmount || 0,
      },
    }
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadFactories() {
  // 无工厂列表权限（如财务）时跳过请求，避免 403 噪音。
  if (!auth.hasPermission('system:factory:list')) {
    factories.value = []
    return
  }
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
}

function handleSearch() {
  filters.page = 1
  loadLoans()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  filters.page = 1
  loadLoans()
}

function handlePageChange(value) {
  filters.page = value
  loadLoans()
}

function handleSizeChange(value) {
  filters.size = value
  filters.page = 1
  loadLoans()
}

function openCreate() {
  formError.value = ''
  form.amountYuan = ''
  form.loanDate = todayIso()
  form.purpose = ''
  form.expectedRepayDate = ''
  form.factoryId = auth.factoryId ? String(auth.factoryId) : ''
  form.department = ''
  dialogVisible.value = true
}

async function submitForm() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  formError.value = ''
  try {
    await createLoan({
      amount: yuanToCents(form.amountYuan),
      loanDate: form.loanDate,
      purpose: form.purpose.trim(),
      expectedRepayDate: form.expectedRepayDate || null,
      factoryId: form.factoryId ? String(form.factoryId) : null,
      department: form.department.trim() || null,
    })
    ElMessage.success('借款草稿已保存，请在列表中提交审批')
    dialogVisible.value = false
    await loadLoans()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

async function doSubmit(row) {
  try {
    await ElMessageBox.confirm(
      `确认提交借款单 ${row.loanNo} 进入审批？金额 ${formatMoney(row.amount)}。`,
      '提交审批',
      { confirmButtonText: '提交', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await submitLoan(row.id)
    ElMessage.success('已提交审批')
    await loadLoans()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function doCancel(row) {
  try {
    await ElMessageBox.confirm(
      row.status === 'PENDING' ? `撤销借款单 ${row.loanNo} 的审批申请？` : `取消借款草稿 ${row.loanNo}？`,
      row.status === 'PENDING' ? '撤销审批' : '取消草稿',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await cancelLoan(row.id)
    ElMessage.success(row.status === 'PENDING' ? '审批已撤销' : '草稿已取消')
    await loadLoans()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await fetchLoan(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

function openAction(row, mode) {
  actionTarget.value = row
  actionMode.value = mode
  actionError.value = ''
  actionForm.method = 'TRANSFER'
  actionForm.repaymentDate = todayIso()
  actionForm.remark = ''
  actionForm.amountYuan = mode === 'repay' ? centsToYuan(row.outstandingAmount) : ''
  actionVisible.value = true
}

async function submitAction() {
  if (!actionTarget.value) return
  actionError.value = ''
  actionBusy.value = true
  try {
    if (isDisburse.value) {
      await disburseLoan(actionTarget.value.id, { method: actionForm.method })
      ElMessage.success('放款已登记')
    } else {
      let amount
      try {
        amount = yuanToCents(actionForm.amountYuan)
      } catch {
        actionError.value = '还款金额格式不正确'
        return
      }
      if (BigInt(amount) <= 0n) {
        actionError.value = '还款金额必须大于 0'
        return
      }
      if (BigInt(amount) > BigInt(String(actionTarget.value.outstandingAmount || 0))) {
        actionError.value = '还款金额不能超过未还金额'
        return
      }
      await repayLoan(actionTarget.value.id, {
        amount,
        repaymentDate: actionForm.repaymentDate,
        method: actionForm.method,
        remark: actionForm.remark.trim() || null,
      })
      ElMessage.success('还款已登记')
    }
    actionVisible.value = false
    await loadLoans()
    if (detailVisible.value && detail.value?.id === actionTarget.value.id) {
      detail.value = await fetchLoan(actionTarget.value.id)
    }
  } catch (error) {
    actionError.value = errorMessage(error)
  } finally {
    actionBusy.value = false
  }
}

onMounted(() => {
  loadLoans()
  loadFactories()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · LOANS"
      title="借款与还款"
      description="员工借款独立于费用报销；审批通过后财务放款，还款支持现金/转账和报销付款冲销。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadLoans">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建借款
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="借款口径">
      <template #default>
        借款与报销是两类独立单据，借款不会并入报销。低于 5000 元由厂长审批、5000 元及以上由财务审批；
        审批通过只进入“待放款”，财务实际放款后才开始计还款。报销付款时选择冲销借款会生成一条
        “报销冲销”还款记录，不产生现金流水。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon">
          <el-icon><Wallet /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">借款总额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">当前筛选下共 {{ pageData.summary.count }} 张借款单</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber">
          <el-icon><Coin /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">未还金额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.outstandingAmount) }}</strong>
          <span class="metric-card__hint">还款中 {{ pageData.summary.activeCount }} 张</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">累计已还</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.repaidAmount) }}</strong>
          <span class="metric-card__hint">含现金还款与报销冲销</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--slate">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">已还清</span>
          <strong class="metric-card__value">{{ pageData.summary.repaidCount }}</strong>
          <span class="metric-card__hint">未还清借款请及时跟进</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="借款单号、借款人、用途" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="借款日起">
          <el-date-picker v-model="filters.dateFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="借款日止">
          <el-date-picker v-model="filters.dateTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>财务可查看全部借款单；厂长查看本厂和本人；其他员工只看本人。</span>
        <span>汇总指标按当前筛选条件统计，不受分页限制。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">LOANS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张借款单</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="借款单 / 借款人" min-width="210">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.loanNo }}</div>
            <div class="cell-secondary">{{ row.borrowerName || `用户 #${row.borrowerUserId}` }}</div>
          </template>
        </el-table-column>
        <el-table-column label="用途" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.purpose }}</template>
        </el-table-column>
        <el-table-column label="借款 / 未还" width="150" align="right">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ formatMoney(row.amount) }}</div>
            <div v-if="row.status === 'DISBURSED'" class="cell-secondary mono-text">
              未还 {{ formatMoney(row.outstandingAmount) }}
            </div>
            <div v-else-if="row.status === 'REPAID'" class="cell-secondary">已还清</div>
          </template>
        </el-table-column>
        <el-table-column label="借款日期" width="115">
          <template #default="{ row }">
            <span class="mono-text">{{ row.loanDate }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ row.statusName || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="245" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-if="canSubmit(row)" link type="primary" @click="doSubmit(row)">提交</el-button>
              <el-button v-if="canCancel(row)" link type="warning" @click="doCancel(row)">
                {{ row.status === 'PENDING' ? '撤销' : '取消' }}
              </el-button>
              <el-button
                v-if="canDisburse && row.status === 'APPROVED'"
                link
                type="success"
                @click="openAction(row, 'disburse')"
              >
                放款
              </el-button>
              <el-button
                v-if="canRepay && row.status === 'DISBURSED'"
                link
                type="success"
                @click="openAction(row, 'repay')"
              >
                还款
              </el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-block">
            <strong>暂无借款单</strong>
            <span>{{ canWrite ? '点击右上角“新建借款”创建第一张单据。' : '当前筛选条件下没有可见单据。' }}</span>
          </div>
        </template>
      </el-table>

      <div class="table-pager">
        <el-pagination
          :current-page="filters.page"
          :page-size="filters.size"
          :page-sizes="[10, 20, 50]"
          :total="pageData.total"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" title="新建借款" width="620px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="dialog-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="借款金额（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="例如 3000.00" />
          </el-form-item>
          <el-form-item label="借款日期" prop="loanDate">
            <el-date-picker v-model="form.loanDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="预计还款日期（可选）">
            <el-date-picker v-model="form.expectedRepayDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="归属工厂">
            <el-select v-model="form.factoryId" placeholder="默认本人所属工厂" clearable style="width: 100%">
              <el-option v-for="item in factories" :key="item.id" :label="item.name" :value="String(item.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="归属部门 / 职能">
            <el-input v-model="form.department" placeholder="例如 销售部、生产部" maxlength="64" />
          </el-form-item>
        </div>
        <el-form-item label="借款用途" prop="purpose">
          <el-input
            v-model="form.purpose"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="说明借款用途、预计还款来源"
          />
        </el-form-item>
        <p class="form-tip">保存后为草稿，需在列表点击“提交”才会进入审批；审批通过后等待财务放款。</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存草稿</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="借款单详情" size="540px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-stack">
        <template v-if="detail">
          <div class="detail-hero">
            <div>
              <span class="detail-hero__eyebrow">LOAN</span>
              <h3 class="mono-text">{{ detail.loanNo }}</h3>
            </div>
            <el-tag :type="statusTagType(detail.status)" effect="light">{{ detail.statusName || detail.status }}</el-tag>
          </div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="借款人">{{ detail.borrowerName || `用户 #${detail.borrowerUserId}` }}</el-descriptions-item>
            <el-descriptions-item label="借款日期">{{ detail.loanDate }}</el-descriptions-item>
            <el-descriptions-item label="借款金额">{{ formatMoney(detail.amount) }}</el-descriptions-item>
            <el-descriptions-item label="预计还款">{{ detail.expectedRepayDate || '—' }}</el-descriptions-item>
            <el-descriptions-item label="累计已还">{{ formatMoney(detail.repaidAmount) }}</el-descriptions-item>
            <el-descriptions-item label="未还金额">{{ formatMoney(detail.outstandingAmount) }}</el-descriptions-item>
            <el-descriptions-item label="归属工厂">{{ factoryLabel(detail.factoryId) }}</el-descriptions-item>
            <el-descriptions-item label="归属部门">{{ detail.department || '—' }}</el-descriptions-item>
            <el-descriptions-item label="放款方式">{{ detail.disburseMethod || '—' }}</el-descriptions-item>
            <el-descriptions-item label="放款时间">{{ detail.disbursedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="审批意见" :span="2">{{ detail.approvalNote || '—' }}</el-descriptions-item>
            <el-descriptions-item label="借款用途" :span="2">{{ detail.purpose }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-section">
            <h4>还款记录</h4>
            <el-table :data="detail.repayments || []" size="small" class="data-table">
              <el-table-column label="还款单号" min-width="150">
                <template #default="{ row }"><span class="mono-text">{{ row.repaymentNo }}</span></template>
              </el-table-column>
              <el-table-column label="金额" width="110" align="right">
                <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
              </el-table-column>
              <el-table-column label="方式" width="95">
                <template #default="{ row }">{{ row.methodName || row.method }}</template>
              </el-table-column>
              <el-table-column label="日期" width="105">
                <template #default="{ row }"><span class="mono-text">{{ row.repaymentDate }}</span></template>
              </el-table-column>
              <template #empty>
                <div class="empty-block">
                  <strong>暂无还款记录</strong>
                  <span>{{ detail.status === 'DISBURSED' ? '财务登记还款或报销冲销后显示。' : '借款放款后才开始还款。' }}</span>
                </div>
              </template>
            </el-table>
            <div v-if="detail.repayments?.length" class="repay-notes">
              <div v-for="item in detail.repayments" :key="`${item.id}-note`" class="repay-note">
                <span class="mono-text">{{ item.repaymentNo }}</span>
                <span>{{ item.expenseClaimNo ? `冲销报销 ${item.expenseClaimNo}` : '手工还款' }}</span>
                <span>{{ item.remark || '—' }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog
      v-model="actionVisible"
      :title="isDisburse ? '登记借款放款' : '登记借款还款'"
      width="520px"
      destroy-on-close
    >
      <el-alert v-if="actionError" type="error" :title="actionError" :closable="false" show-icon class="dialog-alert" />
      <template v-if="actionTarget">
        <div class="pay-summary">
          <div><span>借款单</span><strong class="mono-text">{{ actionTarget.loanNo }}</strong></div>
          <div><span>借款金额</span><strong class="mono-text">{{ formatMoney(actionTarget.amount) }}</strong></div>
          <div><span>未还金额</span><strong class="mono-text">{{ formatMoney(actionTarget.outstandingAmount) }}</strong></div>
        </div>
        <el-form label-position="top">
          <el-form-item v-if="!isDisburse" label="还款金额（元）">
            <el-input v-model="actionForm.amountYuan" placeholder="不能超过未还金额" />
          </el-form-item>
          <div class="form-grid">
            <el-form-item v-if="!isDisburse" label="还款日期">
              <el-date-picker v-model="actionForm.repaymentDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
            </el-form-item>
            <el-form-item :label="isDisburse ? '放款方式' : '还款方式'">
              <el-select v-model="actionForm.method" style="width: 100%">
                <el-option label="转账" value="TRANSFER" />
                <el-option label="现金" value="CASH" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item v-if="!isDisburse" label="备注">
            <el-input v-model="actionForm.remark" type="textarea" :rows="2" maxlength="500" show-word-limit />
          </el-form-item>
          <p class="form-tip">
            {{ isDisburse ? '确认后借款进入“还款中”，未还金额等于借款金额。' : '还款后未还金额自动扣减，还清后借款状态变为“已还清”。' }}
          </p>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionBusy" @click="submitAction">
          {{ isDisburse ? '确认放款' : '确认还款' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
