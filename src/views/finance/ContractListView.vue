<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { createContract, enterContract, fetchContractPage, fetchCustomer } from '@/api/customer'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney, yuanToCents } from '@/utils/money'
import {
  CONTRACT_STATUS,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  contractStatusLabel,
} from '@/constants'

const auth = useAuthStore()

const filters = reactive({ keyword: '', customerId: '', status: '', page: 1, size: 10 })
const pageData = ref({ records: [], total: 0, pageNumber: 1, pageSize: 10 })
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const formRef = ref()
const customerName = ref('')

const form = reactive({
  contractNo: '',
  customerId: '',
  contractType: 'FRAMEWORK',
  startDate: '',
  endDate: '',
  amountYuan: '',
  currency: 'CNY',
  settlementMethod: 'MONTHLY',
  paymentDays: 30,
  taxRate: 0.13,
  priceTerms: '',
  qualityTerms: '',
  attachmentUrl: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('finance:contract:write'))
const hasFilters = computed(() => Boolean(filters.keyword || filters.customerId || filters.status))

const rules = {
  contractNo: [{ required: true, message: '请输入财务合同编号', trigger: 'blur' }],
  customerId: [{ required: true, message: '请输入客户 ID', trigger: 'blur' }],
  amountYuan: [
    { required: true, message: '请输入合同金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        try {
          if (BigInt(yuanToCents(value)) <= 0n) {
            callback(new Error('合同金额必须大于 0'))
            return
          }
          callback()
        } catch {
          callback(new Error('合同金额格式不正确'))
        }
      },
      trigger: 'blur',
    },
  ],
}

function statusTagType(value) {
  return CONTRACT_STATUS[value]?.type || 'info'
}

async function loadContracts() {
  loading.value = true
  loadError.value = ''
  try {
    const params = { page: filters.page, size: filters.size }
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim()
    if (filters.customerId.trim()) params.customerId = filters.customerId.trim()
    if (filters.status) params.status = filters.status
    const data = await fetchContractPage(params)
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
  loadContracts()
}

function resetFilters() {
  filters.keyword = ''
  filters.customerId = ''
  filters.status = ''
  filters.page = 1
  loadContracts()
}

function openCreate() {
  Object.assign(form, {
    contractNo: '',
    customerId: '',
    contractType: 'FRAMEWORK',
    startDate: '',
    endDate: '',
    amountYuan: '',
    currency: 'CNY',
    settlementMethod: 'MONTHLY',
    paymentDays: 30,
    taxRate: 0.13,
    priceTerms: '',
    qualityTerms: '',
    attachmentUrl: '',
    remark: '',
  })
  customerName.value = ''
  formError.value = ''
  dialogVisible.value = true
}

async function lookupCustomer() {
  if (!form.customerId.trim()) return
  try {
    const value = await fetchCustomer(form.customerId.trim())
    customerName.value = value.name
  } catch (error) {
    customerName.value = ''
    formError.value = errorMessage(error)
  }
}

async function submit(enterNow) {
  formError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const created = await createContract({
      contractNo: form.contractNo.trim(),
      customerId: form.customerId.trim(),
      contractType: form.contractType,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      contractAmount: yuanToCents(form.amountYuan),
      currency: form.currency,
      settlementMethod: form.settlementMethod,
      paymentDays: form.paymentDays,
      taxRate: form.taxRate,
      priceTerms: form.priceTerms.trim() || null,
      qualityTerms: form.qualityTerms.trim() || null,
      attachmentUrl: form.attachmentUrl.trim() || null,
      remark: form.remark.trim() || null,
    })
    if (enterNow) {
      await enterContract(created.id)
      ElMessage.success('合同已保存并正式录入')
    } else {
      ElMessage.success('合同草稿已保存，录入后才能用于下单')
    }
    dialogVisible.value = false
    await loadContracts()
  } catch (error) {
    formError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

async function handleEnter(row) {
  try {
    await ElMessageBox.confirm(
      `确认将合同 ${row.contractNo} 正式录入？录入后订单即可引用该合同。`,
      '正式录入合同',
      { confirmButtonText: '确认录入', cancelButtonText: '取消', type: 'warning' },
    )
    await enterContract(row.id)
    ElMessage.success('合同已正式录入')
    await loadContracts()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      loadError.value = errorMessage(error)
    }
  }
}

onMounted(loadContracts)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="FINANCE · CONTRACTS"
      title="合同管理"
      description="财务正式录入、编号并归档合同；订单只能引用“已录入/生效”的合同。"
    >
      <template #actions>
        <el-button :loading="loading" @click="loadContracts">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>新建合同
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="合同是下单前置条件">
      <template #default>
        合同金额、剩余额度和执行进度会参与订单审批与信用控制。新建合同默认“待财务录入”，
        必须点击“正式录入”或保存并录入后才能被订单选择。
      </template>
    </el-alert>

    <section class="panel filter-panel">
      <el-form :model="filters" class="filter-form" label-position="top" @submit.prevent="handleSearch">
        <el-form-item label="合同编号">
          <el-input v-model="filters.keyword" placeholder="模糊查询合同编号" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="客户 ID">
          <el-input v-model="filters.customerId" placeholder="如 9001" clearable @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="合同状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable>
            <el-option
              v-for="item in CONTRACT_STATUS_OPTIONS"
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
          <el-button :disabled="!hasFilters" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />

    <section class="panel table-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">CONTRACT RECORDS</span>
          <h2>共 {{ pageData.total.toLocaleString('zh-CN') }} 份合同</h2>
        </div>
        <span class="table-panel__meta">金额单位：元 · 后端按分存储</span>
      </div>

      <el-table v-loading="loading" :data="pageData.records" class="data-table" row-key="id">
        <el-table-column label="合同编号" min-width="180">
          <template #default="{ row }">
            <span class="mono-text">{{ row.contractNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="客户 ID" width="110">
          <template #default="{ row }">#{{ row.customerId }}</template>
        </el-table-column>
        <el-table-column label="合同类型" min-width="130">
          <template #default="{ row }">
            {{ CONTRACT_TYPE_OPTIONS.find((item) => item.value === row.contractType)?.label || row.contractType }}
          </template>
        </el-table-column>
        <el-table-column label="合同金额" min-width="150" align="right">
          <template #default="{ row }">{{ formatMoney(row.contractAmount, row.currency) }}</template>
        </el-table-column>
        <el-table-column label="有效期" min-width="200">
          <template #default="{ row }">{{ row.startDate || '—' }} 至 {{ row.endDate || '长期' }}</template>
        </el-table-column>
        <el-table-column label="录入人" min-width="130">
          <template #default="{ row }">
            <div>{{ row.entryUserName || '—' }}</div>
            <div class="cell-secondary">{{ formatDateTime(row.entryTime) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" effect="light">{{ contractStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canWrite && row.status === 'PENDING_ENTRY'"
              text
              type="primary"
              @click="handleEnter(row)"
            >
              <el-icon><CircleCheck /></el-icon>正式录入
            </el-button>
            <span v-else class="cell-secondary">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="暂无合同" description="请调整筛选条件，或由财务新建合同并正式录入。" />
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
          @size-change="(size) => { filters.size = size; filters.page = 1; loadContracts() }"
          @current-change="(page) => { filters.page = page; loadContracts() }"
        />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" title="新建合同" width="820px" destroy-on-close>
      <el-alert v-if="formError" type="error" :title="formError" :closable="false" show-icon class="section-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-grid">
          <el-form-item label="合同编号" prop="contractNo">
            <el-input v-model="form.contractNo" placeholder="财务正式编号，如 HT-2026-0001" maxlength="64" />
          </el-form-item>
          <el-form-item label="客户 ID" prop="customerId">
            <el-input v-model="form.customerId" placeholder="如 9001" maxlength="20">
              <template #append>
                <el-button @click="lookupCustomer">校验</el-button>
              </template>
            </el-input>
            <template #extra><span class="field-hint">{{ customerName || '输入客户 ID 后可校验名称' }}</span></template>
          </el-form-item>
          <el-form-item label="合同类型">
            <el-select v-model="form.contractType">
              <el-option
                v-for="item in CONTRACT_TYPE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="合同金额（元）" prop="amountYuan">
            <el-input v-model="form.amountYuan" placeholder="0.00" inputmode="decimal" />
          </el-form-item>
          <el-form-item label="开始日期">
            <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结算方式">
            <el-select v-model="form.settlementMethod">
              <el-option label="预付" value="PREPAID" />
              <el-option label="月结" value="MONTHLY" />
              <el-option label="承兑" value="ACCEPTANCE" />
              <el-option label="其他" value="OTHER" />
            </el-select>
          </el-form-item>
          <el-form-item label="账期（天）">
            <el-input-number v-model="form.paymentDays" :min="0" :max="365" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="税率">
            <el-input-number
              v-model="form.taxRate"
              :min="0"
              :max="1"
              :step="0.01"
              :precision="4"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="附件地址">
            <el-input v-model="form.attachmentUrl" placeholder="合同扫描件路径，可选" maxlength="500" />
          </el-form-item>
        </div>
        <el-form-item label="价格条款">
          <el-input v-model="form.priceTerms" type="textarea" :rows="2" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item label="质量条款">
          <el-input v-model="form.qualityTerms" type="textarea" :rows="2" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button :loading="saving" @click="submit(false)">保存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="submit(true)">保存并正式录入</el-button>
      </template>
    </el-dialog>
  </div>
</template>
