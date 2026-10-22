<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Coin, Document, Plus, Refresh, Search, Wallet } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import {
  cancelExpense,
  createExpense,
  fetchExpense,
  fetchExpensePage,
  fetchOutstandingLoans,
  payExpense,
  submitExpense,
} from '@/api/finance'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { centsToYuan, formatMoney, yuanToCents } from '@/utils/money'

/**
 * 费用报销（V1.4 财务 8.5 / 审批矩阵“费用报销”）。
 *
 * 流程：员工建草稿 → 提交审批（≤1000 元厂长审批，>1000 元财务审批）→
 * 待付款 → 财务付款 → 已付款。审批通过不等于付款，付款时可用报销人的
 * 未还借款冲销一部分。金额全部按“分”提交，页面只做元/分转换。
 */
const auth = useAuthStore()

const EXPENSE_TYPES = [
  { value: 'TRAVEL', label: '差旅' },
  { value: 'ENTERTAINMENT', label: '业务招待' },
  { value: 'PURCHASE', label: '采购' },
  { value: 'RENT_UTILITIES', label: '房租水电' },
  { value: 'LOGISTICS', label: '物流' },
  { value: 'OFFICE', label: '办公' },
  { value: 'MAINTENANCE', label: '维修' },
  { value: 'OTHER', label: '其他' },
]

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING', label: '审批中' },
  { value: 'APPROVED', label: '待付款' },
  { value: 'PAID', label: '已付款' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'CANCELLED', label: '已取消' },
]

const filters = reactive({
  keyword: '',
  status: '',
  expenseType: '',
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
    draftCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    paidCount: 0,
    rejectedCount: 0,
    totalAmount: 0,
    pendingAmount: 0,
    approvedAmount: 0,
    paidAmount: 0,
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

const payVisible = ref(false)
const paying = ref(false)
const payError = ref('')
const payTarget = ref(null)
const outstandingLoans = ref([])
const loansLoading = ref(false)
const payForm = reactive({
  paymentMethod: 'TRANSFER',
  offsetLoanId: '',
  offsetYuan: '',
  remark: '',
})

const form = reactive({
  expenseType: 'TRAVEL',
  amountYuan: '',
  expenseDate: todayIso(),
  factoryId: '',
  department: '',
  orderNo: '',
  description: '',
  attachmentUrl: '',
})

const canWrite = computed(() => auth.hasPermission('finance:expense:write'))
const canPay = computed(() => auth.hasPermission('finance:expense:pay'))
const hasFilters = computed(() =>
  Boolean(filters.keyword || filters.status || filters.expenseType || filters.dateFrom || filters.dateTo),
)

const rules = {
  expenseType: [{ required: true, message: '请选择费用类型', trigger: 'change' }],
  expenseDate: [{ required: true, message: '请选择费用发生日期', trigger: 'change' }],
  amountYuan: [
    { required: true, message: '请输入报销金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('报销金额必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('报销金额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
  description: [{ required: true, message: '请填写费用说明', trigger: 'blur' }],
}

const offsetCents = computed(() => {
  try {
    return BigInt(payForm.offsetYuan ? yuanToCents(payForm.offsetYuan) : '0')
  } catch {
    return 0n
  }
})

const claimCents = computed(() => BigInt(String(payTarget.value?.amount || 0)))
const cashCents = computed(() => {
  const cash = claimCents.value - offsetCents.value
  return cash > 0n ? cash : 0n
})
const hasCash = computed(() => cashCents.value > 0n)

/** 本地日期 yyyy-MM-dd（避免 toISOString 的时区偏移）。 */
function todayIso() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function typeLabel(value) {
  return EXPENSE_TYPES.find((item) => item.value === value)?.label || value || '—'
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
    PAID: 'success',
    REJECTED: 'danger',
    CANCELLED: 'info',
  }[status] || 'info'
}

function isOwner(row) {
  return String(row.claimantUserId) === String(auth.userId)
}

function canSubmit(row) {
  return canWrite.value && ['DRAFT', 'REJECTED'].includes(row.status) && (isOwner(row) || canPay.value)
}

function canCancel(row) {
  return canWrite.value && ['DRAFT', 'PENDING'].includes(row.status) && (isOwner(row) || canPay.value)
}

function canPayAction(row) {
  return canPay.value && row.status === 'APPROVED'
}

async function loadExpenses() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.status) params.status = filters.status
    if (filters.expenseType) params.expenseType = filters.expenseType
    if (filters.dateFrom) params.dateFrom = filters.dateFrom
    if (filters.dateTo) params.dateTo = filters.dateTo
    const data = await fetchExpensePage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
      summary: {
        count: Number(data.summary?.count || 0),
        draftCount: Number(data.summary?.draftCount || 0),
        pendingCount: Number(data.summary?.pendingCount || 0),
        approvedCount: Number(data.summary?.approvedCount || 0),
        paidCount: Number(data.summary?.paidCount || 0),
        rejectedCount: Number(data.summary?.rejectedCount || 0),
        totalAmount: data.summary?.totalAmount || 0,
        pendingAmount: data.summary?.pendingAmount || 0,
        approvedAmount: data.summary?.approvedAmount || 0,
        paidAmount: data.summary?.paidAmount || 0,
      },
    }
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loadFactories() {
  // 财务等角色没有工厂列表权限，直接跳过，避免控制台出现无意义的 403。
  if (!auth.hasPermission('system:factory:list')) {
    factories.value = []
    return
  }
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    // 归属显示退化为工厂 ID，不影响报销。
    factories.value = []
  }
}

function handleSearch() {
  filters.page = 1
  loadExpenses()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.expenseType = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  filters.page = 1
  loadExpenses()
}

function handlePageChange(value) {
  filters.page = value
  loadExpenses()
}

function handleSizeChange(value) {
  filters.size = value
  filters.page = 1
  loadExpenses()
}

function openCreate() {
  formError.value = ''
  form.expenseType = 'TRAVEL'
  form.amountYuan = ''
  form.expenseDate = todayIso()
  form.factoryId = auth.factoryId ? String(auth.factoryId) : ''
  form.department = ''
  form.orderNo = ''
  form.description = ''
  form.attachmentUrl = ''
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
    await createExpense({
      expenseType: form.expenseType,
      amount: yuanToCents(form.amountYuan),
      expenseDate: form.expenseDate,
      factoryId: form.factoryId ? String(form.factoryId) : null,
      department: form.department.trim() || null,
      orderNo: form.orderNo.trim() ? String(form.orderNo).trim() : null,
      description: form.description.trim(),
      attachmentUrl: form.attachmentUrl.trim() || null,
    })
    ElMessage.success('报销草稿已保存，请在列表中提交审批')
    dialogVisible.value = false
    await loadExpenses()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

async function doSubmit(row) {
  try {
    await ElMessageBox.confirm(
      `确认提交报销单 ${row.claimNo} 进入审批？金额 ${formatMoney(row.amount)}。`,
      '提交审批',
      { confirmButtonText: '提交', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await submitExpense(row.id)
    ElMessage.success('已提交审批')
    await loadExpenses()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function doCancel(row) {
  try {
    await ElMessageBox.confirm(
      row.status === 'PENDING'
        ? `撤销报销单 ${row.claimNo} 的审批申请？`
        : `取消报销草稿 ${row.claimNo}？`,
      row.status === 'PENDING' ? '撤销审批' : '取消草稿',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await cancelExpense(row.id)
    ElMessage.success(row.status === 'PENDING' ? '审批已撤销' : '草稿已取消')
    await loadExpenses()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await fetchExpense(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function openPay(row) {
  payTarget.value = row
  payError.value = ''
  payForm.paymentMethod = 'TRANSFER'
  payForm.offsetLoanId = ''
  payForm.offsetYuan = ''
  payForm.remark = ''
  payVisible.value = true
  loansLoading.value = true
  try {
    outstandingLoans.value = (await fetchOutstandingLoans(row.id)) || []
  } catch (error) {
    outstandingLoans.value = []
    payError.value = errorMessage(error)
  } finally {
    loansLoading.value = false
  }
}

/** 选择借款后默认冲销“报销金额与未还金额的较小值”。 */
function applyOffsetDefault() {
  if (!payForm.offsetLoanId) {
    payForm.offsetYuan = ''
    return
  }
  const loan = outstandingLoans.value.find((item) => String(item.id) === String(payForm.offsetLoanId))
  if (!loan) return
  const outstanding = BigInt(String(loan.outstandingAmount || 0))
  const offset = claimCents.value < outstanding ? claimCents.value : outstanding
  payForm.offsetYuan = centsToYuan(offset)
}

async function submitPay() {
  if (!payTarget.value) return
  payError.value = ''
  if (payForm.offsetLoanId && offsetCents.value <= 0n) {
    payError.value = '选择冲销借款后，冲销金额必须大于 0'
    return
  }
  if (offsetCents.value > claimCents.value) {
    payError.value = '冲销金额不能超过报销金额'
    return
  }
  if (cashCents.value > 0n && !['CASH', 'TRANSFER'].includes(payForm.paymentMethod)) {
    payError.value = '存在现金支付时，请选择现金或转账'
    return
  }
  paying.value = true
  try {
    await payExpense(payTarget.value.id, {
      paymentMethod: cashCents.value === 0n ? 'OFFSET' : payForm.paymentMethod,
      offsetLoanId: payForm.offsetLoanId ? String(payForm.offsetLoanId) : null,
      offsetLoanAmount: offsetCents.value > 0n ? offsetCents.value.toString() : '0',
      remark: payForm.remark.trim() || null,
    })
    ElMessage.success('付款已登记')
    payVisible.value = false
    await loadExpenses()
  } catch (error) {
    payError.value = errorMessage(error)
  } finally {
    paying.value = false
  }
}

onMounted(() => {
  loadExpenses()
  loadFactories()
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · EXPENSES"
      title="费用报销"
      description="员工提交费用报销，按金额档位进入统一审批；审批通过后由财务付款，可用未还借款冲销。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadExpenses">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建报销
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="报销口径">
      <template #default>
        报销金额按分存储，页面录入的元最多保留两位小数并直接截断，不做四舍五入。低于 1000 元由厂长审批、
        1000 元及以上由财务审批；审批通过只进入“待付款”，财务登记付款后才算结清。借款与报销是独立单据，
        付款时冲销借款会生成一条“报销冲销”还款记录。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon">
          <el-icon><Document /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">报销总额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">当前筛选下共 {{ pageData.summary.count }} 张单据</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber">
          <el-icon><Wallet /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">待付款金额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.approvedAmount) }}</strong>
          <span class="metric-card__hint">已通过审批 {{ pageData.summary.approvedCount }} 张</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">已付款（现金）</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.paidAmount) }}</strong>
          <span class="metric-card__hint">审批中金额 {{ formatMoney(pageData.summary.pendingAmount) }}</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--slate">
          <el-icon><Coin /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">审批中单据</span>
          <strong class="metric-card__value">{{ pageData.summary.pendingCount }}</strong>
          <span class="metric-card__hint">草稿 {{ pageData.summary.draftCount }} · 驳回 {{ pageData.summary.rejectedCount }}</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="报销单号、报销人、说明或订单号" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option v-for="item in STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="费用类型">
          <el-select v-model="filters.expenseType" placeholder="全部类型" clearable>
            <el-option v-for="item in EXPENSE_TYPES" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="费用日期起">
          <el-date-picker v-model="filters.dateFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="费用日期止">
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
        <span>财务可查看全部报销单；厂长查看本厂和本人；其他员工只看本人。</span>
        <span>汇总指标按当前筛选条件统计，不受分页限制。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">EXPENSE CLAIMS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张报销单</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="报销单 / 报销人" min-width="215">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.claimNo }}</div>
            <div class="cell-secondary">{{ row.claimantName || `用户 #${row.claimantUserId}` }}</div>
          </template>
        </el-table-column>
        <el-table-column label="费用类型 / 日期" width="150">
          <template #default="{ row }">
            <div class="cell-primary">{{ row.expenseTypeName || typeLabel(row.expenseType) }}</div>
            <div class="cell-secondary mono-text">{{ row.expenseDate }}</div>
          </template>
        </el-table-column>
        <el-table-column label="归属" min-width="150">
          <template #default="{ row }">
            <div class="cell-secondary">{{ factoryLabel(row.factoryId) }}{{ row.department ? ` · ${row.department}` : '' }}</div>
            <div v-if="row.orderNo" class="cell-secondary mono-text">订单 {{ row.orderNo }}</div>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="130" align="right">
          <template #default="{ row }">
            <strong class="mono-text">{{ formatMoney(row.amount) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="实付 / 冲销" width="150" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 'PAID'">
              <div class="cell-primary mono-text">{{ formatMoney(row.paidAmount) }}</div>
              <div v-if="Number(row.offsetLoanAmount) > 0" class="cell-secondary">
                冲销 {{ formatMoney(row.offsetLoanAmount) }}
              </div>
            </template>
            <span v-else class="cell-secondary">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ row.statusName || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="235" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-if="canSubmit(row)" link type="primary" @click="doSubmit(row)">提交</el-button>
              <el-button v-if="canCancel(row)" link type="warning" @click="doCancel(row)">
                {{ row.status === 'PENDING' ? '撤销' : '取消' }}
              </el-button>
              <el-button v-if="canPayAction(row)" link type="success" @click="openPay(row)">付款</el-button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-block">
            <strong>暂无报销单</strong>
            <span>{{ canWrite ? '点击右上角“新建报销”创建第一张单据。' : '当前筛选条件下没有可见单据。' }}</span>
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

    <el-dialog v-model="dialogVisible" title="新建费用报销" width="640px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="dialog-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="费用类型" prop="expenseType">
            <el-select v-model="form.expenseType" style="width: 100%">
              <el-option v-for="item in EXPENSE_TYPES" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="报销金额（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="例如 500.00" />
          </el-form-item>
          <el-form-item label="费用发生日期" prop="expenseDate">
            <el-date-picker v-model="form.expenseDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="归属工厂">
            <el-select v-model="form.factoryId" placeholder="默认本人所属工厂" clearable style="width: 100%">
              <el-option v-for="item in factories" :key="item.id" :label="item.name" :value="String(item.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="归属部门 / 职能">
            <el-input v-model="form.department" placeholder="例如 销售部、行政" maxlength="64" />
          </el-form-item>
          <el-form-item label="关联订单号（可选）">
            <el-input v-model="form.orderNo" placeholder="仅用于费用归集" />
          </el-form-item>
        </div>
        <el-form-item label="费用说明" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="说明费用用途、行程或业务背景"
          />
        </el-form-item>
        <el-form-item label="凭据链接（可选）">
          <el-input v-model="form.attachmentUrl" placeholder="发票/收据/行程单的链接地址" maxlength="500" />
        </el-form-item>
        <p class="form-tip">保存后为草稿，需在列表点击“提交”才会进入审批；审批通过后由财务付款。</p>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存草稿</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="报销单详情" size="500px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-stack">
        <template v-if="detail">
          <div class="detail-hero">
            <div>
              <span class="detail-hero__eyebrow">EXPENSE CLAIM</span>
              <h3 class="mono-text">{{ detail.claimNo }}</h3>
            </div>
            <el-tag :type="statusTagType(detail.status)" effect="light">{{ detail.statusName || detail.status }}</el-tag>
          </div>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="报销人">{{ detail.claimantName || `用户 #${detail.claimantUserId}` }}</el-descriptions-item>
            <el-descriptions-item label="费用类型">{{ detail.expenseTypeName || typeLabel(detail.expenseType) }}</el-descriptions-item>
            <el-descriptions-item label="报销金额">{{ formatMoney(detail.amount) }}</el-descriptions-item>
            <el-descriptions-item label="费用日期">{{ detail.expenseDate }}</el-descriptions-item>
            <el-descriptions-item label="归属工厂">{{ factoryLabel(detail.factoryId) }}</el-descriptions-item>
            <el-descriptions-item label="归属部门">{{ detail.department || '—' }}</el-descriptions-item>
            <el-descriptions-item label="关联订单">{{ detail.orderNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="关联客户">{{ detail.customerId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="现金实付">{{ formatMoney(detail.paidAmount) }}</el-descriptions-item>
            <el-descriptions-item label="冲销借款">{{ formatMoney(detail.offsetLoanAmount) }}</el-descriptions-item>
            <el-descriptions-item label="付款方式">{{ detail.paymentMethod || '—' }}</el-descriptions-item>
            <el-descriptions-item label="付款时间">{{ detail.paidAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="审批意见" :span="2">{{ detail.approvalNote || '—' }}</el-descriptions-item>
            <el-descriptions-item label="付款备注" :span="2">{{ detail.paymentRemark || '—' }}</el-descriptions-item>
            <el-descriptions-item label="费用说明" :span="2">{{ detail.description }}</el-descriptions-item>
            <el-descriptions-item label="凭据" :span="2">
              <a v-if="detail.attachmentUrl" :href="detail.attachmentUrl" target="_blank" rel="noreferrer">
                {{ detail.attachmentUrl }}
              </a>
              <span v-else>—</span>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="最后更新">{{ detail.updatedAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="payVisible" title="登记报销付款" width="560px" destroy-on-close>
      <el-alert v-if="payError" type="error" :title="payError" :closable="false" show-icon class="dialog-alert" />
      <template v-if="payTarget">
        <div class="pay-summary">
          <div><span>报销金额</span><strong class="mono-text">{{ formatMoney(payTarget.amount) }}</strong></div>
          <div><span>冲销借款</span><strong class="mono-text">{{ formatMoney(offsetCents.toString()) }}</strong></div>
          <div><span>现金实付</span><strong class="mono-text">{{ formatMoney(cashCents.toString()) }}</strong></div>
        </div>
        <el-form label-position="top">
          <el-form-item label="冲销借款（可选）">
            <el-select
              v-model="payForm.offsetLoanId"
              :loading="loansLoading"
              placeholder="不冲销借款"
              clearable
              style="width: 100%"
              @change="applyOffsetDefault"
            >
              <el-option
                v-for="loan in outstandingLoans"
                :key="loan.id"
                :label="`${loan.loanNo} · 未还 ${formatMoney(loan.outstandingAmount)}`"
                :value="String(loan.id)"
              />
            </el-select>
            <span v-if="!loansLoading && outstandingLoans.length === 0" class="form-tip">
              该报销人当前没有可冲销的未还借款。
            </span>
          </el-form-item>
          <el-form-item v-if="payForm.offsetLoanId" label="冲销金额（元）">
            <el-input v-model="payForm.offsetYuan" placeholder="不能超过报销金额和借款余额" />
          </el-form-item>
          <el-form-item v-if="hasCash" label="现金支付方式">
            <el-radio-group v-model="payForm.paymentMethod">
              <el-radio-button value="TRANSFER">转账</el-radio-button>
              <el-radio-button value="CASH">现金</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="付款备注">
            <el-input v-model="payForm.remark" type="textarea" :rows="2" maxlength="500" show-word-limit />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="payVisible = false">取消</el-button>
        <el-button type="primary" :loading="paying" @click="submitPay">确认付款</el-button>
      </template>
    </el-dialog>
  </div>
</template>
