<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Document, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import CustomerSelect from '@/components/CustomerSelect.vue'
import { allocateReceipt, createReceipt, fetchOpenReceivables, fetchReceipt, fetchReceiptPage } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney, yuanToCents } from '@/utils/money'
import {
  RECEIPT_METHOD_OPTIONS,
  RECEIPT_STATUS,
  RECEIPT_STATUS_OPTIONS,
  receiptMethodLabel,
  receiptStatusLabel,
} from '@/constants'

/**
 * 收款登记与核销（V1.4 页面矩阵 FIN-03）。
 *
 * 收款单只登记到账，核销时才减少应收余额。核销金额、可用余额都以“分”做
 * 整数运算，前端不做四舍五入，后端在事务内加锁二次校验。
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

const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const loading = ref(false)
const loadError = ref('')

const createVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()

const form = reactive({
  customerId: '',
  amountYuan: '',
  receivedDate: new Date().toISOString().slice(0, 10),
  method: 'BANK_TRANSFER',
  bankAccount: '',
  serialNo: '',
  attachmentUrl: '',
  remark: '',
})

const allocateVisible = ref(false)
const allocating = ref(false)
const allocateError = ref('')
const currentReceipt = ref(null)
const openReceivables = ref([])
const openLoading = ref(false)
const lines = ref([])

const detailVisible = ref(false)
const detail = ref(null)
const detailLoading = ref(false)

const canWrite = computed(() => auth.hasPermission('finance:receipt:write'))
const hasFilters = computed(() =>
  Boolean(filters.keyword || filters.customerId || filters.status || filters.dateFrom || filters.dateTo),
)

const rules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  amountYuan: [
    { required: true, message: '请输入收款金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('收款金额必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('收款金额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
}

/** 收款单可用余额（分），用于和核销合计比较。 */
const availableCents = computed(() => {
  try {
    return BigInt(String(currentReceipt.value?.availableAmount ?? '0'))
  } catch {
    return 0n
  }
})

/** 本次核销合计（分）。 */
const allocateTotal = computed(() =>
  lines.value.reduce((sum, line) => sum + (line.cents || 0n), 0n),
)

const allocateOverflow = computed(
  () => allocateTotal.value > 0n && allocateTotal.value > availableCents.value,
)

function statusTagType(value) {
  return RECEIPT_STATUS[value]?.type || 'info'
}

/** 解析用户输入的元为分；非法输入返回 null，交给表单规则提示。 */
function parseCents(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  try {
    return BigInt(yuanToCents(value))
  } catch {
    return null
  }
}

async function loadReceipts() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.customerId) params.customerId = filters.customerId
    if (filters.status) params.status = filters.status
    if (filters.dateFrom) params.dateFrom = filters.dateFrom
    if (filters.dateTo) params.dateTo = filters.dateTo
    const data = await fetchReceiptPage(params)
    pageData.value = {
      records: data.records || [],
      total: Number(data.total || 0),
      pageNumber: Number(data.pageNumber || 1),
      pageSize: Number(data.pageSize || filters.size),
    }
  } catch (error) {
    loadError.value = errorMessage(error)
    pageData.value = { records: [], total: 0, pageNumber: 1, pageSize: filters.size }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filters.page = 1
  loadReceipts()
}

function resetFilters() {
  filters.keyword = ''
  filters.customerId = ''
  filters.status = ''
  filters.dateFrom = ''
  filters.dateTo = ''
  filters.page = 1
  loadReceipts()
}

function openCreate() {
  Object.assign(form, {
    customerId: '',
    amountYuan: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    method: 'BANK_TRANSFER',
    bankAccount: '',
    serialNo: '',
    attachmentUrl: '',
    remark: '',
  })
  formError.value = ''
  createVisible.value = true
}

async function submitCreate() {
  formError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const created = await createReceipt({
      customerId: form.customerId,
      amount: yuanToCents(form.amountYuan),
      receivedDate: form.receivedDate || null,
      method: form.method,
      bankAccount: form.bankAccount.trim() || null,
      serialNo: form.serialNo.trim() || null,
      attachmentUrl: form.attachmentUrl.trim() || null,
      remark: form.remark.trim() || null,
    })
    ElMessage.success('收款已登记，未核销部分作为预收待认领')
    createVisible.value = false
    await loadReceipts()
    // 登记后直接进入核销，减少财务的重复操作。
    if (created && Number(created.availableAmount) > 0) {
      openAllocate(created)
    }
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

/** 打开核销弹窗：加载该客户未结清应收。 */
async function openAllocate(row) {
  allocateError.value = ''
  currentReceipt.value = row
  lines.value = []
  allocateVisible.value = true
  openLoading.value = true
  try {
    const list = (await fetchOpenReceivables(row.customerId)) || []
    openReceivables.value = list
    lines.value = list.map((item) => ({
      receivableId: String(item.id),
      receivableNo: item.receivableNo,
      dueDate: item.dueDate,
      outstanding: item.outstandingAmount,
      currency: item.currency,
      amountYuan: '',
      cents: 0n,
    }))
  } catch (error) {
    allocateError.value = errorMessage(error)
    openReceivables.value = []
  } finally {
    openLoading.value = false
  }
}

/** 输入金额变化时同步“分”值，避免重复解析。 */
function handleLineInput(line) {
  line.cents = parseCents(line.amountYuan) ?? 0n
}

/** 一键把某笔应收按未收余额（或收款可用余额）核销。 */
function fillFull(line) {
  const outstanding = BigInt(String(line.outstanding ?? '0'))
  const target = outstanding < availableCents.value ? outstanding : availableCents.value
  if (target <= 0n) return
  // 用整数拆分“元/分”，避免浮点误差。
  const yuan = target / 100n
  const fraction = (target % 100n).toString().padStart(2, '0')
  line.amountYuan = `${yuan}.${fraction}`
  line.cents = target
}

async function submitAllocate() {
  allocateError.value = ''
  const payload = lines.value
    .filter((line) => line.cents && line.cents > 0n)
    .map((line) => ({ receivableId: line.receivableId, amount: line.cents.toString() }))
  if (!payload.length) {
    allocateError.value = '请至少填写一笔核销金额'
    return
  }
  if (allocateOverflow.value) {
    allocateError.value = '核销总额超过收款单可用余额'
    return
  }
  allocating.value = true
  try {
    await allocateReceipt(currentReceipt.value.id, { allocations: payload })
    ElMessage.success('核销完成，应收余额和客户信用已同步')
    allocateVisible.value = false
    await loadReceipts()
  } catch (error) {
    allocateError.value = errorMessage(error)
  } finally {
    allocating.value = false
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await fetchReceipt(row.id)
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    detailLoading.value = false
  }
}

onMounted(loadReceipts)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · RECEIPTS"
      title="收款核销"
      description="登记客户实际到账，并按未结应收逐笔核销；核销后应收余额与客户信用同步释放。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadReceipts">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>登记收款
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="收款与核销规则">
      <template #default>
        一张收款单可以核销多张应收，一张应收也可以分多次收款；核销总额不能超过收款单可用余额。
        未核销余额作为预收待认领，不会自动冲减应收。
      </template>
    </el-alert>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="客户名称、流水号或收款单号"
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
              v-for="item in RECEIPT_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="收款日起">
          <el-date-picker v-model="filters.dateFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="收款日止">
          <el-date-picker v-model="filters.dateTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">RECEIPTS &amp; ALLOCATION</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 张收款单</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="收款单号" min-width="170">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.receiptNo }}</div>
            <div class="cell-secondary">{{ row.serialNo || '无流水号' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.customerName || `客户 #${row.customerId}` }}</div>
            <div class="cell-secondary">{{ row.customerCode || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="收款日期" width="120">
          <template #default="{ row }">{{ row.receivedDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="方式" width="110">
          <template #default="{ row }">{{ receiptMethodLabel(row.method) }}</template>
        </el-table-column>
        <el-table-column label="收款金额" min-width="140" align="right">
          <template #default="{ row }">{{ formatMoney(row.amount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="已核销" min-width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.allocatedAmount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="可用余额" min-width="140" align="right">
          <template #default="{ row }">
            <strong>{{ formatMoney(row.availableAmount, row.currency) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ receiptStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canWrite && Number(row.availableAmount) > 0"
              text
              type="primary"
              @click="openAllocate(row)"
            >
              <el-icon><Tickets /></el-icon>核销
            </el-button>
            <el-button text type="info" @click="openDetail(row)">
              <el-icon><Document /></el-icon>明细
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无收款单" description="请调整筛选条件，或登记一笔客户收款。" />
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

    <el-dialog v-model="createVisible" title="登记收款" width="720px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="section-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="客户" prop="customerId">
            <CustomerSelect v-model="form.customerId" />
          </el-form-item>
          <el-form-item label="收款金额（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="0.00" inputmode="decimal" />
          </el-form-item>
          <el-form-item label="收款日期">
            <el-date-picker v-model="form.receivedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="收款方式">
            <el-select v-model="form.method">
              <el-option
                v-for="item in RECEIPT_METHOD_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="收款账户">
            <el-input v-model="form.bankAccount" placeholder="如 中国银行 尾号 8821" maxlength="128" />
          </el-form-item>
          <el-form-item label="流水号 / 票据号">
            <el-input v-model="form.serialNo" placeholder="银行流水号" maxlength="64" />
          </el-form-item>
          <el-form-item label="凭证地址">
            <el-input v-model="form.attachmentUrl" placeholder="回单/凭证链接，可留空" maxlength="500" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </div>
        <div class="form-actions">
          <el-button type="primary" :loading="saving" @click="submitCreate">
            <el-icon><CircleCheck /></el-icon>保存收款
          </el-button>
          <el-button @click="createVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-dialog v-model="allocateVisible" title="核销收款" width="900px" destroy-on-close>
      <el-alert v-if="allocateError" type="error" :title="allocateError" :closable="false" show-icon class="section-alert" />
      <div v-if="currentReceipt" class="preview-list">
        <div>
          <dt>收款单</dt>
          <dd>{{ currentReceipt.receiptNo }} · {{ currentReceipt.customerName }}</dd>
        </div>
        <div>
          <dt>收款金额</dt>
          <dd>{{ formatMoney(currentReceipt.amount, currentReceipt.currency) }}</dd>
        </div>
        <div>
          <dt>可用余额</dt>
          <dd>{{ formatMoney(currentReceipt.availableAmount, currentReceipt.currency) }}</dd>
        </div>
      </div>

      <el-table v-loading="openLoading" :data="lines" class="data-table" row-key="receivableId">
        <el-table-column label="应收单号" min-width="170">
          <template #default="{ row }">
            <span class="mono-text">{{ row.receivableNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="到期日" width="120">
          <template #default="{ row }">{{ row.dueDate || '—' }}</template>
        </el-table-column>
        <el-table-column label="未收金额" min-width="130" align="right">
          <template #default="{ row }">{{ formatMoney(row.outstanding, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="本次核销（元）" min-width="220">
          <template #default="{ row }">
            <el-input
              v-model="row.amountYuan"
              placeholder="0.00"
              inputmode="decimal"
              @input="handleLineInput(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110">
          <template #default="{ row }">
            <el-button text type="primary" @click="fillFull(row)">全额核销</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="没有可核销的应收" description="该客户已没有未结清的应收，可先登记应收再核销。" />
        </template>
      </el-table>

      <div class="filter-hint">
        <span>本次核销合计：{{ formatMoney(allocateTotal.toString()) }}</span>
        <span :class="{ 'field-hint--danger': allocateOverflow }">
          可用余额：{{ formatMoney(availableCents.toString()) }}
          {{ allocateOverflow ? '（已超额）' : '' }}
        </span>
      </div>

      <div class="form-actions">
        <el-button type="primary" :loading="allocating" :disabled="allocateOverflow" @click="submitAllocate">
          <el-icon><CircleCheck /></el-icon>提交核销
        </el-button>
        <el-button @click="allocateVisible = false">取消</el-button>
      </div>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="收款明细" size="560px">
      <div v-loading="detailLoading">
        <div v-if="detail" class="preview-list">
          <div><dt>收款单号</dt><dd class="mono-text">{{ detail.receiptNo }}</dd></div>
          <div><dt>客户</dt><dd>{{ detail.customerName }}（{{ detail.customerCode }}）</dd></div>
          <div><dt>收款日期</dt><dd>{{ detail.receivedDate }}</dd></div>
          <div><dt>收款方式</dt><dd>{{ receiptMethodLabel(detail.method) }}</dd></div>
          <div><dt>收款账户</dt><dd>{{ detail.bankAccount || '—' }}</dd></div>
          <div><dt>流水号</dt><dd>{{ detail.serialNo || '—' }}</dd></div>
          <div><dt>收款金额</dt><dd>{{ formatMoney(detail.amount, detail.currency) }}</dd></div>
          <div><dt>已核销</dt><dd>{{ formatMoney(detail.allocatedAmount, detail.currency) }}</dd></div>
          <div><dt>可用余额</dt><dd>{{ formatMoney(detail.availableAmount, detail.currency) }}</dd></div>
          <div><dt>状态</dt><dd>{{ receiptStatusLabel(detail.status) }}</dd></div>
          <div><dt>备注</dt><dd>{{ detail.remark || '—' }}</dd></div>
        </div>

        <h3 v-if="detail" class="form-section-title">核销明细</h3>
        <el-table v-if="detail" :data="detail.allocations || []" class="data-table" row-key="id">
          <el-table-column label="应收单号" min-width="160">
            <template #default="{ row }">
              <span class="mono-text">{{ row.receivableNo }}</span>
            </template>
          </el-table-column>
          <el-table-column label="核销金额" min-width="130" align="right">
            <template #default="{ row }">{{ formatMoney(row.amount) }}</template>
          </el-table-column>
          <el-table-column label="核销时间" min-width="170">
            <template #default="{ row }">{{ row.createdAt?.replace('T', ' ').slice(0, 19) || '—' }}</template>
          </el-table-column>
          <template #empty>
            <EmptyState title="尚未核销" description="该收款单的余额目前作为预收待认领。" />
          </template>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>
