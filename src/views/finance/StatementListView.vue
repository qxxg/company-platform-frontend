<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Document, Plus, Printer, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import CustomerSelect from '@/components/CustomerSelect.vue'
import { confirmStatement, fetchStatement, fetchStatementPage, generateStatement } from '@/api/finance'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatMoney } from '@/utils/money'
import {
  STATEMENT_STATUS,
  STATEMENT_STATUS_OPTIONS,
  statementStatusLabel,
} from '@/constants'

/**
 * 客户对账单（V1.4 页面矩阵 FIN-04）。
 *
 * 按客户和期间生成快照：期初 + 本期应收 - 本期核销收款 = 期末。本期开票仅
 * 作为参考，不冲减应收；未核销预收不进入对账单，保证与应收台账一致。
 */
const auth = useAuthStore()

const filters = reactive({
  keyword: '',
  customerId: '',
  status: '',
  periodFrom: '',
  periodTo: '',
  page: 1,
  size: 10,
})

const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const loading = ref(false)
const loadError = ref('')

const generateVisible = ref(false)
const generating = ref(false)
const generateError = ref('')
const generateFormRef = ref()

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref(null)

const confirmVisible = ref(false)
const confirming = ref(false)
const confirmError = ref('')
const confirmFormRef = ref()
const confirmForm = reactive({ differenceNote: '' })

const canWrite = computed(() => auth.hasPermission('finance:statement:write'))
const hasFilters = computed(() =>
  Boolean(filters.keyword || filters.customerId || filters.status || filters.periodFrom || filters.periodTo),
)

const todayText = formatDateInput(new Date())
const monthStartText = formatDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

const generateForm = reactive({
  customerId: '',
  periodStart: monthStartText,
  periodEnd: todayText,
  remark: '',
})

const generateRules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  periodStart: [{ required: true, message: '请选择期间开始日', trigger: 'change' }],
  periodEnd: [
    { required: true, message: '请选择期间结束日', trigger: 'change' },
    {
      validator: (_rule, value, callback) => {
        if (value && generateForm.periodStart && value < generateForm.periodStart) {
          callback(new Error('期间结束日不能早于开始日'))
          return
        }
        if (value && value > todayText) {
          callback(new Error('期间结束日不能晚于今天'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

/** 本地日期格式化为 YYYY-MM-DD，避免 toISOString 的时区偏移。 */
function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusTagType(value) {
  return STATEMENT_STATUS[value]?.type || 'info'
}

function lineTypeLabel(value) {
  return { RECEIVABLE: '应收', RECEIPT: '收款核销', INVOICE: '开票' }[value] || value
}

function lineTypeTagType(value) {
  return { RECEIVABLE: 'warning', RECEIPT: 'success', INVOICE: 'info' }[value] || 'info'
}

/** 收款核销在展示时带负号，表示冲减应收；底层金额仍为正数。 */
function lineDisplayAmount(line) {
  return line.lineType === 'RECEIPT' ? `-${formatMoney(line.amount)}` : formatMoney(line.amount)
}

async function loadStatements() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.customerId) params.customerId = filters.customerId
    if (filters.status) params.status = filters.status
    if (filters.periodFrom) params.periodFrom = filters.periodFrom
    if (filters.periodTo) params.periodTo = filters.periodTo
    const data = await fetchStatementPage(params)
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
  loadStatements()
}

function resetFilters() {
  filters.keyword = ''
  filters.customerId = ''
  filters.status = ''
  filters.periodFrom = ''
  filters.periodTo = ''
  filters.page = 1
  loadStatements()
}

function openGenerate() {
  Object.assign(generateForm, {
    customerId: '',
    periodStart: monthStartText,
    periodEnd: todayText,
    remark: '',
  })
  generateError.value = ''
  generateVisible.value = true
}

async function submitGenerate() {
  generateError.value = ''
  try {
    await generateFormRef.value.validate()
  } catch {
    return
  }
  generating.value = true
  try {
    const created = await generateStatement({
      customerId: generateForm.customerId,
      periodStart: generateForm.periodStart,
      periodEnd: generateForm.periodEnd,
      remark: generateForm.remark.trim() || null,
    })
    ElMessage.success('对账单已生成，金额已按当前台账固化')
    generateVisible.value = false
    await loadStatements()
    if (created?.id) await openDetail(created)
  } catch (error) {
    generateError.value = errorMessage(error)
  } finally {
    generating.value = false
  }
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await fetchStatement(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

function openConfirm() {
  confirmForm.differenceNote = ''
  confirmError.value = ''
  confirmVisible.value = true
}

/** 从列表直接确认时，先加载完整快照再打开确认框。 */
async function openDetailAndConfirm(row) {
  await openDetail(row)
  if (detail.value?.id) openConfirm()
}

async function submitConfirm() {
  confirming.value = true
  confirmError.value = ''
  try {
    const updated = await confirmStatement(detail.value.id, {
      differenceNote: confirmForm.differenceNote.trim() || null,
    })
    detail.value = updated
    confirmVisible.value = false
    ElMessage.success('对账单已确认归档')
    await loadStatements()
  } catch (error) {
    confirmError.value = errorMessage(error)
  } finally {
    confirming.value = false
  }
}

/** 简单 HTML 转义，打印窗口只渲染系统内数据。 */
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 在新窗口打印对账单；浏览器打印对话框可直接另存为 PDF。 */
function printStatement() {
  if (!detail.value) return
  const item = detail.value
  const rows = (item.lines || [])
    .map(
      (line) => `
        <tr>
          <td>${escapeHtml(line.bizDate)}</td>
          <td>${escapeHtml(lineTypeLabel(line.lineType))}</td>
          <td>${escapeHtml(line.refNo || '—')}</td>
          <td class="num">${escapeHtml(lineDisplayAmount(line))}</td>
          <td>${escapeHtml(line.remark || '')}</td>
        </tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(item.statementNo)} 对账单</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; color: #1f2937; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    .muted { color: #6b7280; font-size: 12px; }
    .meta { margin: 18px 0; font-size: 13px; line-height: 1.9; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
    th { background: #f3f4f6; }
    .num { text-align: right; white-space: nowrap; }
    .summary { display: flex; gap: 28px; margin-top: 16px; font-size: 13px; }
    .summary strong { display: block; font-size: 16px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>客户对账单</h1>
  <div class="muted">${escapeHtml(item.statementNo)} · 生成于 ${escapeHtml(item.createdAt || '')}</div>
  <div class="meta">
    <div>客户：${escapeHtml(item.customerName || '')}（${escapeHtml(item.customerCode || '')}）</div>
    <div>对账期间：${escapeHtml(item.periodStart)} 至 ${escapeHtml(item.periodEnd)}</div>
    <div>状态：${escapeHtml(statementStatusLabel(item.status))}</div>
  </div>
  <table>
    <thead>
      <tr><th>业务日期</th><th>类型</th><th>来源单号</th><th class="num">金额</th><th>说明</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">本期无业务发生</td></tr>'}</tbody>
  </table>
  <div class="summary">
    <div>期初余额<strong>${escapeHtml(formatMoney(item.openingAmount))}</strong></div>
    <div>本期应收<strong>${escapeHtml(formatMoney(item.receivableAmount))}</strong></div>
    <div>本期收款<strong>${escapeHtml(formatMoney(item.receivedAmount))}</strong></div>
    <div>本期开票<strong>${escapeHtml(formatMoney(item.invoiceAmount))}</strong></div>
    <div>期末余额<strong>${escapeHtml(formatMoney(item.closingAmount))}</strong></div>
  </div>
  <p class="muted">本期开票金额仅作参考，不冲减应收；未核销预收不进入本对账单。</p>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`
  const win = window.open('', '_blank', 'width=980,height=720')
  if (!win) {
    ElMessage.warning('浏览器拦截了新窗口，请允许弹窗后重试')
    return
  }
  win.document.write(html)
  win.document.close()
}

onMounted(loadStatements)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · STATEMENTS"
      title="客户对账"
      description="按客户和期间生成对账单，固化期初、本期应收、收款、开票和期末余额。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadStatements">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openGenerate">
          <el-icon><Plus /></el-icon>生成对账单
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="对账口径">
      <template #default>
        期末余额 = 期初 + 本期应收 - 本期核销收款。本期收款按“已核销”口径统计，未核销预收不冲减应收；
        本期开票金额仅作参考。对账单生成后不可修改，重新生成会保留新版本。
      </template>
    </el-alert>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="关键字">
          <el-input
            v-model="filters.keyword"
            placeholder="客户名称、编码或对账单号"
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
              v-for="item in STATEMENT_STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="期间交集起">
          <el-date-picker v-model="filters.periodFrom" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="期间交集止">
          <el-date-picker v-model="filters.periodTo" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item class="filter-form__actions">
          <el-button type="primary" native-type="submit" :loading="loading">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="filter-hint">
        <span>期间筛选按区间交集匹配，可查询跨月对账单。</span>
        <span>对账单快照生成后不再随台账变化，便于客户确认和归档。</span>
      </div>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">CUSTOMER STATEMENTS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 份对账单</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="对账单号" min-width="180">
          <template #default="{ row }">
            <div class="cell-primary mono-text">{{ row.statementNo }}</div>
            <div class="cell-secondary">{{ row.createdAt || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="客户" min-width="180">
          <template #default="{ row }">
            <div>{{ row.customerName || `客户 #${row.customerId}` }}</div>
            <div class="cell-secondary">{{ row.customerCode || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="对账期间" min-width="180">
          <template #default="{ row }">{{ row.periodStart }} 至 {{ row.periodEnd }}</template>
        </el-table-column>
        <el-table-column label="期初" min-width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.openingAmount) }}</template>
        </el-table-column>
        <el-table-column label="本期应收" min-width="120" align="right">
          <template #default="{ row }">{{ formatMoney(row.receivableAmount) }}</template>
        </el-table-column>
        <el-table-column label="本期收款" min-width="120" align="right">
          <template #default="{ row }">-{{ formatMoney(row.receivedAmount) }}</template>
        </el-table-column>
        <el-table-column label="期末" min-width="130" align="right">
          <template #default="{ row }">
            <strong>{{ formatMoney(row.closingAmount) }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">
              {{ statementStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">明细</el-button>
            <el-button
              v-if="canWrite && row.status === 'GENERATED'"
              link
              type="success"
              @click="openDetailAndConfirm(row)"
            >
              确认
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无对账单" description="请调整筛选条件，或按客户和期间生成一份对账单。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadStatements() }"
          @current-change="(page) => { filters.page = page; loadStatements() }"
        />
      </div>
    </section>

    <el-dialog v-model="generateVisible" title="生成客户对账单" width="620px" destroy-on-close>
      <el-alert
        v-if="generateError"
        type="error"
        :title="generateError"
        :closable="false"
        show-icon
        class="section-alert"
      />
      <el-form ref="generateFormRef" :model="generateForm" :rules="generateRules" label-position="top">
        <el-form-item label="客户" prop="customerId">
          <CustomerSelect v-model="generateForm.customerId" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="期间开始日" prop="periodStart">
            <el-date-picker
              v-model="generateForm.periodStart"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="期间结束日" prop="periodEnd">
            <el-date-picker
              v-model="generateForm.periodEnd"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="generateForm.remark" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-alert type="warning" :closable="false" show-icon class="section-alert">
          <template #default>
            生成时会把当前应收、核销、开票数据固化为快照；之后台账变化不会回写已生成的对账单。
          </template>
        </el-alert>
        <div class="form-actions">
          <el-button type="primary" :loading="generating" @click="submitGenerate">
            <el-icon><CircleCheck /></el-icon>生成对账单
          </el-button>
          <el-button @click="generateVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="对账单明细" size="760px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-stack">
        <template v-if="detail">
          <div class="detail-hero">
            <div>
              <span class="detail-hero__eyebrow">{{ detail.statementNo }}</span>
              <h2>{{ detail.customerName || `客户 #${detail.customerId}` }}</h2>
              <p>{{ detail.periodStart }} 至 {{ detail.periodEnd }}</p>
            </div>
            <el-tag :type="statusTagType(detail.status)" effect="dark">
              {{ statementStatusLabel(detail.status) }}
            </el-tag>
          </div>

          <div class="statement-summary">
            <div>
              <span>期初余额</span>
              <strong>{{ formatMoney(detail.openingAmount) }}</strong>
            </div>
            <div>
              <span>本期应收</span>
              <strong>{{ formatMoney(detail.receivableAmount) }}</strong>
            </div>
            <div>
              <span>本期收款</span>
              <strong>-{{ formatMoney(detail.receivedAmount) }}</strong>
            </div>
            <div>
              <span>本期开票（参考）</span>
              <strong>{{ formatMoney(detail.invoiceAmount) }}</strong>
            </div>
            <div class="statement-summary__closing">
              <span>期末余额</span>
              <strong>{{ formatMoney(detail.closingAmount) }}</strong>
            </div>
          </div>

          <el-table :data="detail.lines || []" class="data-table" row-key="id">
            <el-table-column label="业务日期" width="110">
              <template #default="{ row }">{{ row.bizDate }}</template>
            </el-table-column>
            <el-table-column label="类型" width="110">
              <template #default="{ row }">
                <el-tag :type="lineTypeTagType(row.lineType)" effect="light">
                  {{ lineTypeLabel(row.lineType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="来源单号" min-width="190">
              <template #default="{ row }">
                <span class="mono-text">{{ row.refNo || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="金额" min-width="130" align="right">
              <template #default="{ row }">
                <span :class="{ 'text-danger': row.lineType === 'RECEIPT' }">{{ lineDisplayAmount(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }">
                <span class="cell-secondary">{{ row.remark || '—' }}</span>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState title="本期无业务发生" description="对账单仍会保留期初和期末余额，供客户确认。" />
            </template>
          </el-table>

          <el-descriptions :column="2" border>
            <el-descriptions-item label="客户编码">{{ detail.customerCode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="生成时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="确认人">{{ detail.confirmedBy ? `用户 ${detail.confirmedBy}` : '—' }}</el-descriptions-item>
            <el-descriptions-item label="确认时间">{{ detail.confirmedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="差异说明" :span="2">{{ detail.differenceNote || '—' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.remark || '—' }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-actions">
            <el-button @click="printStatement">
              <el-icon><Printer /></el-icon>打印 / 另存 PDF
            </el-button>
            <el-button v-if="canWrite && detail.status === 'GENERATED'" type="success" @click="openConfirm">
              <el-icon><Document /></el-icon>客户确认
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="confirmVisible" title="客户确认对账单" width="520px" destroy-on-close>
      <el-alert
        v-if="confirmError"
        type="error"
        :title="confirmError"
        :closable="false"
        show-icon
        class="section-alert"
      />
      <el-form ref="confirmFormRef" :model="confirmForm" label-position="top">
        <el-form-item label="差异说明">
          <el-input
            v-model="confirmForm.differenceNote"
            type="textarea"
            :rows="3"
            maxlength="500"
            placeholder="如客户对金额有异议，请记录差异原因；无差异可留空"
          />
        </el-form-item>
      </el-form>
      <el-alert type="warning" :closable="false" show-icon class="section-alert">
        <template #default>确认后对账单归档，金额不再修改；如需调整请重新生成新版本。</template>
      </el-alert>
      <div class="form-actions">
        <el-button type="primary" :loading="confirming" @click="submitConfirm">确认归档</el-button>
        <el-button @click="confirmVisible = false">取消</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.statement-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  padding: 16px;
  border-radius: 12px;
  background: var(--el-fill-color-light);
}

.statement-summary span {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.statement-summary strong {
  font-size: 18px;
  font-variant-numeric: tabular-nums;
}

.statement-summary__closing strong {
  color: var(--el-color-primary);
}

.text-danger {
  color: var(--el-color-danger);
}
</style>
