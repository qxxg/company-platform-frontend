<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Back,
  CircleCheck,
  CreditCard,
  Document,
  Edit,
  Tickets,
  Warning,
} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import OrderStatusTag from '@/components/OrderStatusTag.vue'
import { fetchCustomer, fetchCustomerCredit, fetchAvailableContracts, updateCustomer } from '@/api/customer'
import { fetchOrderPage } from '@/api/order'
import { submitApproval } from '@/api/approval'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatMoney } from '@/utils/money'
import {
  CONTRACT_STATUS,
  CUSTOMER_STATUS,
  CUSTOMER_STATUS_OPTIONS,
  RISK_LEVEL_OPTIONS,
  contractStatusLabel,
  customerStatusLabel,
  sourceLabel,
} from '@/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const customer = ref(null)
const credit = ref(null)
const contracts = ref([])
const orders = ref([])
const sectionError = ref('')
const editVisible = ref(false)
const saving = ref(false)
const formRef = ref()

// 信用额度属于审批字段：页面只能提交调整申请，由审批中心流转后落地。
const creditRequestVisible = ref(false)
const creditRequestSaving = ref(false)
const creditRequestError = ref('')
const creditRequestForm = reactive({
  creditLimitYuan: '0.00',
  reason: '',
})

const editForm = reactive({
  shortName: '',
  customerType: 'ENTERPRISE',
  creditCode: '',
  industry: '',
  region: '',
  contactName: '',
  contactTitle: '',
  contactPhone: '',
  contactEmail: '',
  contactWechat: '',
  address: '',
  defaultFactoryId: '',
  status: 'PROSPECT',
  riskLevel: 'NORMAL',
  firstCooperationDate: '',
  remark: '',
})

const canWrite = computed(() => auth.hasPermission('customer:write'))
const canCreateOrder = computed(() => auth.hasPermission('order:create'))
const canManageContracts = computed(() => auth.hasPermission('finance:contract:read'))
const creditLimit = computed(() => customer.value?.creditLimit || 0)
const creditUsed = computed(() => Number(credit.value?.uncollectedReceivable || 0))
const creditAvailable = computed(() => Math.max(0, Number(creditLimit.value) - creditUsed.value))

function statusTagType(value) {
  return CUSTOMER_STATUS[value]?.type || 'info'
}

function contractTagType(value) {
  return CONTRACT_STATUS[value]?.type || 'info'
}

async function load() {
  loading.value = true
  loadError.value = ''
  sectionError.value = ''
  try {
    const [detail, creditData] = await Promise.all([
      fetchCustomer(route.params.id),
      fetchCustomerCredit(route.params.id).catch(() => null),
    ])
    customer.value = detail
    credit.value = creditData

    const optional = [
      fetchOrderPage({ customerId: detail.id, page: 1, size: 5 })
        .then((data) => {
          orders.value = data.records || []
        })
        .catch(() => {
          orders.value = []
        }),
    ]
    if (canCreateOrder.value) {
      optional.push(
        fetchAvailableContracts(detail.id)
          .then((data) => {
            contracts.value = data || []
          })
          .catch(() => {
            contracts.value = []
          }),
      )
    }
    await Promise.all(optional)
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

/** 打开信用额度调整申请：额度属于审批字段，只能提交申请。 */
function openCreditRequest() {
  const value = customer.value
  if (!value) return
  creditRequestForm.creditLimitYuan = String((Number(value.creditLimit || 0) / 100).toFixed(2))
  creditRequestForm.reason = ''
  creditRequestError.value = ''
  creditRequestVisible.value = true
}

/** 提交信用额度调整申请。 */
async function submitCreditRequest() {
  const text = String(creditRequestForm.creditLimitYuan || '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    creditRequestError.value = '额度格式不正确，最多 2 位小数'
    return
  }
  const [whole, fraction = ''] = text.split('.')
  const creditLimit = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  creditRequestSaving.value = true
  creditRequestError.value = ''
  try {
    const instance = await submitApproval({
      businessType: 'CREDIT_LIMIT',
      businessId: String(customer.value.id),
      title: `客户 #${customer.value.id} 信用额度调整为 ${text} 元`,
      amount: creditLimit,
      payload: { customerId: customer.value.id, creditLimit },
    })
    ElMessage.success(`调整申请已提交（${instance.instanceNo}），等待财务审批`)
    creditRequestVisible.value = false
  } catch (error) {
    creditRequestError.value = errorMessage(error)
  } finally {
    creditRequestSaving.value = false
  }
}

function openEdit() {
  const value = customer.value
  if (!value) return
  Object.assign(editForm, {
    shortName: value.shortName || '',
    customerType: value.customerType || 'ENTERPRISE',
    creditCode: value.creditCode || '',
    industry: value.industry || '',
    region: value.region || '',
    contactName: value.contactName || '',
    contactTitle: value.contactTitle || '',
    contactPhone: value.contactPhone || '',
    contactEmail: value.contactEmail || '',
    contactWechat: value.contactWechat || '',
    address: value.address || '',
    defaultFactoryId: value.defaultFactoryId ? String(value.defaultFactoryId) : '',
    status: value.status || 'PROSPECT',
    riskLevel: value.riskLevel || 'NORMAL',
    firstCooperationDate: value.firstCooperationDate || '',
    remark: value.remark || '',
  })
  editVisible.value = true
}

async function saveEdit() {
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const updated = await updateCustomer(customer.value.id, {
      ...editForm,
      shortName: editForm.shortName.trim() || null,
      creditCode: editForm.creditCode.trim() || null,
      industry: editForm.industry.trim() || null,
      region: editForm.region.trim() || null,
      contactName: editForm.contactName.trim() || null,
      contactTitle: editForm.contactTitle.trim() || null,
      contactPhone: editForm.contactPhone.trim() || null,
      contactEmail: editForm.contactEmail.trim() || null,
      contactWechat: editForm.contactWechat.trim() || null,
      address: editForm.address.trim() || null,
      defaultFactoryId: editForm.defaultFactoryId || null,
      firstCooperationDate: editForm.firstCooperationDate || null,
      remark: editForm.remark.trim() || null,
    })
    customer.value = updated
    editVisible.value = false
    ElMessage.success('客户联系信息已更新')
    await load()
  } catch (error) {
    sectionError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="CUSTOMER 360"
      title="客户详情"
      description="客户档案、信用应收、合同和最近订单聚合。敏感字段变更仍需审批。"
    >
      <template #actions>
        <el-button @click="router.push('/customers')">
          <el-icon><Back /></el-icon>返回列表
        </el-button>
        <el-button v-if="canWrite && customer" type="primary" @click="openEdit">
          <el-icon><Edit /></el-icon>编辑联系信息
        </el-button>
        <el-button
          v-if="auth.hasPermission('approval:submit') && customer"
          type="warning"
          @click="openCreditRequest"
        >
          <el-icon><CreditCard /></el-icon>申请调整信用额度
        </el-button>
      </template>
    </PageHeader>

    <el-alert v-if="loadError" type="error" :title="loadError" :closable="false" show-icon class="section-alert" />
    <el-alert v-if="sectionError" type="error" :title="sectionError" :closable="false" show-icon class="section-alert" />

    <div v-loading="loading">
      <template v-if="customer">
        <section class="panel detail-banner">
          <div class="detail-banner__main">
            <div class="detail-banner__eyebrow">CUSTOMER PROFILE</div>
            <h2>{{ customer.name }}</h2>
            <div class="detail-banner__meta">
              <span class="mono-text">{{ customer.customerCode }}</span>
              <el-tag :type="statusTagType(customer.status)" effect="light">
                {{ customerStatusLabel(customer.status) }}
              </el-tag>
              <el-tag effect="plain">来源：{{ sourceLabel(customer.source) }}</el-tag>
              <el-tag v-if="customer.riskLevel === 'HIGH'" type="danger" effect="light">高风险</el-tag>
            </div>
          </div>
          <div class="detail-banner__side">
            <span class="detail-banner__label">归属业务员</span>
            <strong>{{ customer.ownerName || `用户 #${customer.ownerUserId}` }}</strong>
            <span class="detail-banner__sub">账期 {{ customer.paymentDays ?? 0 }} 天 · {{ customer.currency }}</span>
          </div>
        </section>

        <div class="metric-grid">
          <section class="panel metric-card">
            <div class="metric-card__icon"><el-icon><CreditCard /></el-icon></div>
            <div>
              <span class="metric-card__label">信用额度</span>
              <strong class="metric-card__value">{{ formatMoney(creditLimit, customer.currency) }}</strong>
              <span class="metric-card__hint">0 表示未授信</span>
            </div>
          </section>
          <section class="panel metric-card">
            <div class="metric-card__icon metric-card__icon--amber"><el-icon><Warning /></el-icon></div>
            <div>
              <span class="metric-card__label">未收应收</span>
              <strong class="metric-card__value">{{ formatMoney(creditUsed, customer.currency) }}</strong>
              <span class="metric-card__hint">订单占用由订单服务另行汇总</span>
            </div>
          </section>
          <section class="panel metric-card">
            <div class="metric-card__icon metric-card__icon--green"><el-icon><CircleCheck /></el-icon></div>
            <div>
              <span class="metric-card__label">可用授信（应收口径）</span>
              <strong class="metric-card__value">{{ formatMoney(creditAvailable, customer.currency) }}</strong>
              <span class="metric-card__hint">下单时还会扣除未发货订单</span>
            </div>
          </section>
          <section class="panel metric-card">
            <div class="metric-card__icon metric-card__icon--red"><el-icon><Warning /></el-icon></div>
            <div>
              <span class="metric-card__label">最大逾期</span>
              <strong class="metric-card__value">{{ credit?.maxOverdueDays ?? 0 }} 天</strong>
              <span class="metric-card__hint">超过 30 天阻断下单</span>
            </div>
          </section>
        </div>

        <div class="detail-columns">
          <section class="panel">
            <div class="panel__head">
              <div>
                <span class="panel__eyebrow">MASTER DATA</span>
                <h2>客户档案</h2>
              </div>
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="客户简称">{{ customer.shortName || '—' }}</el-descriptions-item>
              <el-descriptions-item label="客户类型">{{ customer.customerType || '—' }}</el-descriptions-item>
              <el-descriptions-item label="信用代码">{{ customer.creditCode || '—' }}</el-descriptions-item>
              <el-descriptions-item label="行业/区域">
                {{ customer.industry || '—' }} / {{ customer.region || '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="联系人">
                {{ customer.contactName || '—' }} {{ customer.contactTitle ? `（${customer.contactTitle}）` : '' }}
              </el-descriptions-item>
              <el-descriptions-item label="电话">{{ customer.contactPhone || '—' }}</el-descriptions-item>
              <el-descriptions-item label="邮箱">{{ customer.contactEmail || '—' }}</el-descriptions-item>
              <el-descriptions-item label="微信">{{ customer.contactWechat || '—' }}</el-descriptions-item>
              <el-descriptions-item label="地址" :span="2">{{ customer.address || '—' }}</el-descriptions-item>
              <el-descriptions-item label="结算方式">{{ customer.settlementMethod || '—' }}</el-descriptions-item>
              <el-descriptions-item label="默认税率">{{ customer.defaultTaxRate ?? '—' }}</el-descriptions-item>
              <el-descriptions-item label="开票抬头">{{ customer.billingTitle || '—' }}</el-descriptions-item>
              <el-descriptions-item label="税号">{{ customer.taxNo || '—' }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDateTime(customer.createdAt) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatDateTime(customer.updatedAt) }}</el-descriptions-item>
              <el-descriptions-item label="备注" :span="2">{{ customer.remark || '—' }}</el-descriptions-item>
            </el-descriptions>
          </section>

          <div class="detail-side">
            <section class="panel">
              <div class="panel__head">
                <div>
                  <span class="panel__eyebrow">CONTRACTS</span>
                  <h2>可下单合同</h2>
                </div>
                <el-button v-if="canManageContracts" text type="primary" @click="router.push('/finance/contracts')">
                  合同管理
                </el-button>
              </div>
              <div v-if="contracts.length" class="stack-list">
                <div v-for="contract in contracts" :key="contract.id" class="stack-list__item">
                  <div>
                    <strong class="mono-text">{{ contract.contractNo }}</strong>
                    <small>{{ contract.startDate || '—' }} 至 {{ contract.endDate || '长期' }}</small>
                  </div>
                  <div class="stack-list__right">
                    <span>{{ formatMoney(contract.contractAmount, contract.currency) }}</span>
                    <el-tag :type="contractTagType(contract.status)" size="small">
                      {{ contractStatusLabel(contract.status) }}
                    </el-tag>
                  </div>
                </div>
              </div>
              <el-empty v-else description="暂无已录入且未到期的合同" :image-size="64" />
            </section>

            <section class="panel">
              <div class="panel__head">
                <div>
                  <span class="panel__eyebrow">RECENT ORDERS</span>
                  <h2>最近订单</h2>
                </div>
                <el-button text type="primary" @click="router.push('/orders')">全部订单</el-button>
              </div>
              <div v-if="orders.length" class="stack-list">
                <div v-for="order in orders" :key="order.orderNo" class="stack-list__item">
                  <div>
                    <strong class="mono-text">{{ order.orderNo }}</strong>
                    <small>{{ formatDateTime(order.createdAt) }}</small>
                  </div>
                  <div class="stack-list__right">
                    <span>{{ formatMoney(order.totalAmount, order.currency) }}</span>
                    <OrderStatusTag :status="order.orderStatus" size="small" />
                  </div>
                </div>
              </div>
              <el-empty v-else description="暂无订单" :image-size="64" />
            </section>
          </div>
        </div>
      </template>
    </div>

    <el-dialog v-model="creditRequestVisible" title="申请调整信用额度" width="560px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="额度属于审批字段"
        class="section-alert"
      >
        <template #default>
          提交后进入审批中心，由财务按金额档位审批；审批通过后额度自动更新，页面不能直接改数。
        </template>
      </el-alert>
      <el-alert v-if="creditRequestError" type="error" :title="creditRequestError" :closable="false" show-icon class="section-alert" />
      <el-form label-position="top">
        <el-form-item label="调整后信用额度（元）">
          <el-input v-model="creditRequestForm.creditLimitYuan" inputmode="decimal" placeholder="0.00" />
          <template #extra><span class="field-hint">最多 2 位小数；0 表示未授信。</span></template>
        </el-form-item>
        <el-form-item label="申请说明">
          <el-input
            v-model="creditRequestForm.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            placeholder="说明额度调整原因，例如订单增加、账期调整"
          />
        </el-form-item>
      </el-form>
      <div class="form-actions">
        <el-button type="primary" :loading="creditRequestSaving" @click="submitCreditRequest">提交申请</el-button>
        <el-button @click="creditRequestVisible = false">取消</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑客户联系信息" width="720px" destroy-on-close>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="客户名称、归属业务员、信用额度、结算方式和开票信息属于审批字段，请通过后续审批流程变更。"
        class="section-alert"
      />
      <el-form ref="formRef" :model="editForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="客户简称">
            <el-input v-model="editForm.shortName" maxlength="64" />
          </el-form-item>
          <el-form-item label="信用代码">
            <el-input v-model="editForm.creditCode" maxlength="32" />
          </el-form-item>
          <el-form-item label="行业">
            <el-input v-model="editForm.industry" maxlength="64" />
          </el-form-item>
          <el-form-item label="区域">
            <el-input v-model="editForm.region" maxlength="64" />
          </el-form-item>
          <el-form-item label="联系人">
            <el-input v-model="editForm.contactName" maxlength="64" />
          </el-form-item>
          <el-form-item label="职务">
            <el-input v-model="editForm.contactTitle" maxlength="64" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="editForm.contactPhone" maxlength="32" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="editForm.contactEmail" maxlength="128" />
          </el-form-item>
          <el-form-item label="微信">
            <el-input v-model="editForm.contactWechat" maxlength="64" />
          </el-form-item>
          <el-form-item label="地址">
            <el-input v-model="editForm.address" maxlength="255" />
          </el-form-item>
          <el-form-item label="客户状态">
            <el-select v-model="editForm.status">
              <el-option
                v-for="item in CUSTOMER_STATUS_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="风险等级">
            <el-select v-model="editForm.riskLevel">
              <el-option v-for="item in RISK_LEVEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="首次合作日期">
            <el-date-picker
              v-model="editForm.firstCooperationDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
