<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Document, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import CustomerSelect from '@/components/CustomerSelect.vue'
import {
  createInvoice,
  fetchInvoice,
  fetchInvoicePage,
  sendInvoice,
  signInvoice,
} from '@/api/finance'
import { fetchContractPage } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney, yuanToCents } from '@/utils/money'
import {
  INVOICE_STATUS,
  INVOICE_STATUS_OPTIONS,
  INVOICE_TYPE_OPTIONS,
  invoiceStatusLabel,
  invoiceTypeLabel,
} from '@/constants'

/**
 * 手工开票登记（V1.4 页面矩阵 FIN-05）。
 *
 * 只做内部开票记录，不对接税控或电子发票平台。金额为价税合计，税额和税率
 * 仅用于核对；开票金额不得超过合同金额，作废/红冲待审批中心上线后开放。
 */
const auth = useAuthStore()

const filters = reactive({
  keyword: '',
  customerId: '',
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
  summary: { totalAmount: 0, taxAmount: 0, count: 0, validCount: 0 },
})
const loading = ref(false)
const loadError = ref('')

const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()
const contracts = ref([])
const contractsLoading = ref(false)

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const form = reactive({
  customerId: '',
  contractId: '',
  orderNo: '',
  invoiceNumber: '',
  invoiceType: 'VAT_SPECIAL',
  invoiceTitle: '',
  taxNo: '',
  amountYuan: '',
  taxAmountYuan: '',
  taxRate: '13',
  invoiceDate: new Date().toISOString().slice(0, 10),
  attachmentUrl: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('finance:invoice:write'))
const hasFilters = computed(() =>
  Boolean(filters.keyword || filters.customerId || filters.status || filters.dateFrom || filters.dateTo),
)

/** 价税合计（分），用于税额上限校验。 */
function amountCents(value) {
  try {
    return BigInt(yuanToCents(value))
  } catch {
    return 0n
  }
}

const rules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  invoiceNumber: [{ required: true, message: '请输入发票号码', trigger: 'blur' }],
  invoiceTitle: [{ required: true, message: '请输入开票抬头', trigger: 'blur' }],
  invoiceDate: [{ required: true, message: '请选择开票日期', trigger: 'change' }],
  amountYuan: [
    { required: true, message: '请输入价税合计', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('价税合计必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('价税合计格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
  taxAmountYuan: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || String(value).trim() === '') {
          callback()
          return
        }
        try {
          const tax = BigInt(yuanToCents(value))
          if (tax < 0n) {
            callback(new Error('税额不能为负数'))
            return
          }
          if (form.amountYuan && tax > amountCents(form.amountYuan)) {
            callback(new Error('税额不能超过价税合计'))
            return
          }
          callback()
        } catch {
          callback(new Error('税额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
  taxRate: [
    {
      validator: (_rule, value, callback) => {
        if (value === null || value === undefined || String(value).trim() === '') {
          callback()
          return
        }
        const rate = Number(value)
        if (Number.isNaN(rate) || rate < 0 || rate > 100) {
          callback(new Error('税率必须在 0–100 之间'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

function statusTagType(value) {
  return INVOICE_STATUS[value]?.type || 'info'
}

async function loadInvoices() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.customerId) params.customerId = filters.customerId
    if (filters.status) params.status = filters.status
    if (filters.dateFrom) params.dateFrom = filters.dateFrom
    if (filters.dateTo) params.dateTo = filters.dateTo
    const data = await fetchInvoicePage(params)
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
  loadInvoices()
}

function resetFilters() {
  filters.keyword = ''
  filters.customerId = ''
  filters.status = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  filters.page = 1
  loadInvoices()
}

function openCreate() {
  Object.assign(form, {
    customerId: '',
    contractId: '',
    orderNo: '',
    invoiceNumber: '',
    invoiceType: 'VAT_SPECIAL',
    invoiceTitle: '',
    taxNo: '',
    amountYuan: '',
    taxAmountYuan: '',
    taxRate: '13',
    invoiceDate: new Date().toISOString().slice(0, 10),
    attachmentUrl: '',
    remark: '',
  })
  contracts.value = []
  formError.value = ''
  dialogVisible.value = true
}

/** 选定客户后加载可用合同，并带出抬头和税号方便财务录入。 */
async function handleCustomerChange(customer) {
  form.contractId = ''
  contracts.value = []
  if (customer) {
    if (!form.invoiceTitle) form.invoiceTitle = customer.billingTitle || customer.name || ''
    if (!form.taxNo) form.taxNo = customer.taxNo || ''
  }
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
    await createInvoice({
      customerId: form.customerId,
      contractId: form.contractId || null,
      orderNo: form.orderNo.trim() || null,
      invoiceNumber: form.invoiceNumber.trim(),
      invoiceType: form.invoiceType,
      invoiceTitle: form.invoiceTitle.trim(),
      taxNo: form.taxNo.trim() || null,
      amount: yuanToCents(form.amountYuan),
      taxAmount: form.taxAmountYuan ? yuanToCents(form.taxAmountYuan) : '0',
      taxRate: form.taxRate === '' ? null : String(form.taxRate),
      invoiceDate: form.invoiceDate,
      attachmentUrl: form.attachmentUrl.trim() || null,
      remark: form.remark.trim() || null,
    })
    ElMessage.success('发票已登记')
    dialogVisible.value = false
    await loadInvoices()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await fetchInvoice(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function advance(row, action) {
  const isSend = action === 'send'
  try {
    await ElMessageBox.confirm(
      isSend ? '确认该发票已寄出给客户？' : '确认客户已签收该发票？',
      isSend ? '标记已寄出' : '标记客户签收',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'info' },
    )
  } catch {
    return
  }
  try {
    const updated = isSend ? await sendInvoice(row.id) : await signInvoice(row.id)
    ElMessage.success(isSend ? '已标记寄出' : '已标记客户签收')
    if (detail.value?.id === updated.id) detail.value = updated
    await loadInvoices()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(loadInvoices)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · INVOICES"
      title="手工开票"
      description="登记已开出的纸质/电子发票，跟踪寄出与签收；只做内部记录，不对接税控平台。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadInvoices">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>登记发票
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="开票口径">
      <template #default>
        发票号码全局唯一；开票金额为价税合计，不得超过合同剩余可开票额度。作废和红冲必须关联原发票并走审批，
        审批中心上线前暂不开放。
      </template>
    </el-alert>

    <section class="metric-grid">
      <div class="panel metric-card">
        <div class="metric-card__icon">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">开票总额</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.totalAmount) }}</strong>
          <span class="metric-card__hint">不含作废/红冲发票</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--amber">
          <el-icon><Document /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">税额合计</span>
          <strong class="metric-card__value">{{ formatMoney(pageData.summary.taxAmount) }}</strong>
          <span class="metric-card__hint">按登记税额汇总</span>
        </div>
      </div>
      <div class="panel metric-card">
        <div class="metric-card__icon metric-card__icon--green">
          <el-icon><Document /></el-icon>
        </div>
        <div>
          <span class="metric-card__label">发票张数</span>
          <strong class="metric-card__value">{{ pageData.summary.count.toLocaleString('zh-CN') }}</strong>
          <span class="metric-card__hint">有效 {{ pageData.summary.validCount }} 张</span>
        </div>
      </div>
    </section>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="客户、发票号码、抬头或系统单号"
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
              v-for="item in INVOICE_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="开票日起">
          <el-date-picker v-model="filters.dateFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="开票日止">
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
        <span>汇总指标按当前筛选条件统计，不受分页限制。</span>
        <span>发票状态按“已登记 → 已寄出 → 客户签收”顺序推进。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">MANUAL INVOICES</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张发票</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="系统单号 / 发票号码" min-width="210">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.invoiceNo }}</div>
            <div class="cell-secondary mono-text">{{ row.invoiceNumber }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.customerName || `客户 #${row.customerId}` }}</div>
            <div class="cell-secondary">{{ row.customerCode || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="合同 / 订单" min-width="160">
          <template #default="{ row }">
            <div>{{ row.contractNo || '—' }}</div>
            <div class="cell-secondary">{{ row.orderNo ? `订单 ${row.orderNo}` : '无关联订单' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" min-width="130">
          <template #default="{ row }">{{ invoiceTypeLabel(row.invoiceType) }}</template>
        </el-table-column>
        <el-table-column label="开票日期" width="120">
          <template #default="{ row }">{{ row.invoiceDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="价税合计" min-width="140" align="right">
          <template #default="{ row }">
            <strong>{{ formatMoney(row.amount) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="税额" min-width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.taxAmount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ invoiceStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="canWrite && row.status === 'REGISTERED'"
              link
              type="primary"
              @click="advance(row, 'send')"
            >
              标记寄出
            </el-button>
            <el-button
              v-if="canWrite && row.status === 'SENT'"
              link
              type="success"
              @click="advance(row, 'sign')"
            >
              客户签收
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无发票" description="请调整筛选条件，或由财务登记一张已开出的发票。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadInvoices() }"
          @current-change="(page) => { filters.page = page; loadInvoices() }"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" title="登记发票" width="760px" destroy-on-close>
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
              <span class="field-hint">关联合同后，开票金额受合同剩余可开票额度限制。</span>
            </template>
          </el-form-item>
          <el-form-item label="发票号码" prop="invoiceNumber">
            <el-input v-model="form.invoiceNumber" placeholder="按发票票面录入" maxlength="64" />
          </el-form-item>
          <el-form-item label="发票类型">
            <el-select v-model="form.invoiceType">
              <el-option
                v-for="item in INVOICE_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="开票抬头" prop="invoiceTitle">
            <el-input v-model="form.invoiceTitle" placeholder="自动带出客户开票抬头，可修改" maxlength="128" />
          </el-form-item>
          <el-form-item label="纳税人识别号">
            <el-input v-model="form.taxNo" placeholder="可选" maxlength="64" />
          </el-form-item>
          <el-form-item label="价税合计（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="0.00" inputmode="decimal" />
            <template #extra>
              <span class="field-hint">按分截断保存，小数超过两位直接截去。</span>
            </template>
          </el-form-item>
          <el-form-item label="税额（元）" prop="taxAmountYuan">
            <el-input v-model="form.taxAmountYuan" placeholder="0.00" inputmode="decimal" />
            <template #extra>
              <span class="field-hint">按票面税额录入，系统不做价税换算。</span>
            </template>
          </el-form-item>
          <el-form-item label="税率（%）" prop="taxRate">
            <el-input v-model="form.taxRate" placeholder="如 13" inputmode="decimal" />
          </el-form-item>
          <el-form-item label="开票日期" prop="invoiceDate">
            <el-date-picker v-model="form.invoiceDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="关联订单号">
            <el-input v-model="form.orderNo" placeholder="可选" maxlength="20" />
          </el-form-item>
          <el-form-item label="附件地址">
            <el-input v-model="form.attachmentUrl" placeholder="可选，发票影像链接" maxlength="500" />
          </el-form-item>
          <el-form-item label="备注" class="form-grid__full">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <el-alert type="warning" :closable="false" show-icon class="section-alert">
          <template #default>发票登记后不可物理删除；作废/红冲需关联原发票并审批。</template>
        </el-alert>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="submit">
            <el-icon><CircleCheck /></el-icon>保存发票
          </el-button>
          <el-button @click="dialogVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="发票详情" size="560px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-stack">
        <template v-if="detail">
          <div class="detail-hero">
            <div>
              <span class="detail-hero__eyebrow">{{ detail.invoiceNo }}</span>
              <h2>{{ detail.customerName || `客户 #${detail.customerId}` }}</h2>
              <p class="mono-text">{{ detail.invoiceNumber }}</p>
            </div>
            <el-tag :type="statusTagType(detail.status)" effect="dark">
              {{ invoiceStatusLabel(detail.status) }}
            </el-tag>
          </div>

          <el-descriptions :column="2" border>
            <el-descriptions-item label="发票类型">{{ invoiceTypeLabel(detail.invoiceType) }}</el-descriptions-item>
            <el-descriptions-item label="开票日期">{{ detail.invoiceDate || '—' }}</el-descriptions-item>
            <el-descriptions-item label="价税合计">{{ formatMoney(detail.amount) }}</el-descriptions-item>
            <el-descriptions-item label="税额">{{ formatMoney(detail.taxAmount) }}</el-descriptions-item>
            <el-descriptions-item label="不含税金额">{{ formatMoney(detail.netAmount) }}</el-descriptions-item>
            <el-descriptions-item label="税率">{{ detail.taxRate ?? 0 }}%</el-descriptions-item>
            <el-descriptions-item label="合同">{{ detail.contractNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="订单">{{ detail.orderNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="开票抬头" :span="2">{{ detail.invoiceTitle }}</el-descriptions-item>
            <el-descriptions-item label="纳税人识别号" :span="2">{{ detail.taxNo || '—' }}</el-descriptions-item>
            <el-descriptions-item label="登记时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="最后修改">{{ detail.updatedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-actions">
            <el-button
              v-if="canWrite && detail.status === 'REGISTERED'"
              type="primary"
              @click="advance(detail, 'send')"
            >
              标记已寄出
            </el-button>
            <el-button
              v-if="canWrite && detail.status === 'SENT'"
              type="success"
              @click="advance(detail, 'sign')"
            >
              客户已签收
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>
