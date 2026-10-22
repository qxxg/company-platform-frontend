<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, CircleCheck, Plus, Tickets, Warning } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import OrderStatusTag from '@/components/OrderStatusTag.vue'
import { createOrder } from '@/api/order'
import { fetchCustomer, fetchCustomerCredit, fetchCustomerPage, fetchAvailableContracts } from '@/api/customer'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { formatCentsPlain, formatMoney, yuanToCents } from '@/utils/money'
import { CUSTOMER_STATUS, contractStatusLabel, customerStatusLabel } from '@/constants'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const submitting = ref(false)
const factoriesLoading = ref(false)
const factories = ref([])
const submitError = ref('')
const createdOrder = ref(null)

const customerOptions = ref([])
const customerSearchLoading = ref(false)
const customerLoading = ref(false)
const selectedCustomer = ref(null)
const customerCredit = ref(null)
const contracts = ref([])
const contractsLoading = ref(false)
const selectedContract = ref(null)

const form = reactive({
  customerId: '',
  contractId: '',
  factoryId: '',
  totalAmount: '',
  currency: 'CNY',
  remark: '',
})

const canCreate = computed(() => auth.hasPermission('order:create'))
const canListFactories = computed(() => auth.hasPermission('system:factory:list'))
const customerOrderable = computed(() => selectedCustomer.value?.status === 'COOPERATING')
const noAvailableContracts = computed(
  () => Boolean(selectedCustomer.value) && !contractsLoading.value && contracts.value.length === 0,
)

const effectiveCents = computed(() => {
  if (!form.totalAmount.trim()) return ''
  try {
    return yuanToCents(form.totalAmount)
  } catch {
    return ''
  }
})

const selectedFactory = computed(() => factories.value.find((item) => String(item.id) === String(form.factoryId)))

const rules = {
  customerId: [{ required: true, message: '请选择客户', trigger: 'change' }],
  contractId: [{ required: true, message: '请选择财务已录入合同', trigger: 'change' }],
  factoryId: [{ required: true, message: '请选择生产工厂', trigger: 'change' }],
  totalAmount: [
    { required: true, message: '请输入订单金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        const text = String(value || '').trim()
        if (!/^\d+(\.\d{1,2})?$/.test(text)) {
          callback(new Error('金额最多 2 位小数，且必须大于 0'))
          return
        }
        try {
          if (BigInt(yuanToCents(text)) < 1n) {
            callback(new Error('订单金额至少为 0.01 元'))
            return
          }
        } catch {
          callback(new Error('金额格式不正确'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }],
}

async function loadFactories() {
  if (!canListFactories.value) return
  factoriesLoading.value = true
  try {
    factories.value = (await fetchFactories()) || []
  } catch (error) {
    submitError.value = `工厂列表加载失败：${errorMessage(error)}`
  } finally {
    factoriesLoading.value = false
  }
}

async function searchCustomers(keyword) {
  customerSearchLoading.value = true
  try {
    const data = await fetchCustomerPage({ page: 1, size: 20, keyword: keyword?.trim() || undefined })
    customerOptions.value = (data.records || []).map((item) => ({
      ...item,
      id: String(item.id),
    }))
  } catch (error) {
    submitError.value = `客户列表加载失败：${errorMessage(error)}`
  } finally {
    customerSearchLoading.value = false
  }
}

async function handleCustomerChange(customerId) {
  form.contractId = ''
  selectedContract.value = null
  selectedCustomer.value = null
  customerCredit.value = null
  contracts.value = []
  if (!customerId) return

  customerLoading.value = true
  contractsLoading.value = true
  try {
    const [detail, credit] = await Promise.all([
      fetchCustomer(customerId),
      fetchCustomerCredit(customerId).catch(() => null),
    ])
    selectedCustomer.value = detail
    customerCredit.value = credit
    form.currency = detail.currency || 'CNY'
    contracts.value = (await fetchAvailableContracts(customerId)) || []
    if (contracts.value.length === 1) {
      form.contractId = String(contracts.value[0].id)
      selectedContract.value = contracts.value[0]
    }
  } catch (error) {
    submitError.value = `客户或合同加载失败：${errorMessage(error)}`
  } finally {
    customerLoading.value = false
    contractsLoading.value = false
  }
}

function handleContractChange(contractId) {
  selectedContract.value = contracts.value.find((item) => String(item.id) === String(contractId)) || null
}

async function submit() {
  submitError.value = ''
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const order = await createOrder({
      customerId: form.customerId,
      contractId: form.contractId,
      factoryId: form.factoryId,
      totalAmount: yuanToCents(form.totalAmount),
      currency: form.currency,
      remark: form.remark.trim() || null,
    })
    createdOrder.value = order
    ElMessage.success('订单已创建，已通过合同与信用校验')
  } catch (error) {
    submitError.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  createdOrder.value = null
  submitError.value = ''
  form.customerId = ''
  form.contractId = ''
  form.factoryId = ''
  form.totalAmount = ''
  form.currency = 'CNY'
  form.remark = ''
  selectedCustomer.value = null
  customerCredit.value = null
  contracts.value = []
  selectedContract.value = null
  formRef.value?.clearValidate()
  searchCustomers('')
}

onMounted(async () => {
  await Promise.all([loadFactories(), searchCustomers('')])
})
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="ORDER MANAGEMENT"
      title="新建订单"
      description="订单必须选择合作中客户和财务已录入合同；提交时服务端强校验信用额度与逾期。"
    >
      <template #actions>
        <el-button @click="router.push('/orders')">
          <el-icon><Back /></el-icon>返回列表
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="下单前置规则">
      <template #default>
        客户状态必须为“合作中”；合同必须为“已录入/生效”且属于该客户；
        信用占用 = 未收应收 + 已确认未发货订单，应收逾期超过 30 天或额度不足会阻断下单。
        所有校验在订单服务端执行，前端提示只是辅助。
      </template>
    </el-alert>

    <el-result
      v-if="!canCreate && !createdOrder"
      icon="warning"
      title="当前角色没有创建订单权限"
      sub-title="请联系管理员分配 order:create 权限。"
    >
      <template #extra>
        <el-button @click="router.push('/dashboard')">返回工作台</el-button>
      </template>
    </el-result>

    <template v-else-if="createdOrder">
      <section class="panel success-panel">
        <el-result icon="success" title="订单创建成功" sub-title="合同与信用校验已通过，订单已写入对应分片。">
          <template #extra>
            <el-button type="primary" @click="router.push({ name: 'order-detail', params: { orderNo: createdOrder.orderNo } })">
              查看订单详情
            </el-button>
            <el-button @click="resetForm"><el-icon><Plus /></el-icon>继续创建</el-button>
          </template>
        </el-result>
        <el-descriptions :column="2" border class="success-details">
          <el-descriptions-item label="订单号">
            <span class="mono-text">{{ createdOrder.orderNo }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态"><OrderStatusTag :status="createdOrder.orderStatus" /></el-descriptions-item>
          <el-descriptions-item label="客户">
            {{ selectedCustomer?.name || `#${createdOrder.customerId}` }}
          </el-descriptions-item>
          <el-descriptions-item label="合同">
            {{ selectedContract?.contractNo || `#${createdOrder.contractId}` }}
          </el-descriptions-item>
          <el-descriptions-item label="生产工厂">{{ selectedFactory?.name || `工厂 #${createdOrder.factoryId}` }}</el-descriptions-item>
          <el-descriptions-item label="订单金额">{{ formatMoney(createdOrder.totalAmount, createdOrder.currency) }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(createdOrder.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="信用额度">
            {{ formatMoney(customerCredit?.creditLimit || selectedCustomer?.creditLimit, createdOrder.currency) }}
          </el-descriptions-item>
        </el-descriptions>
      </section>
    </template>

    <div v-else class="order-create-grid">
      <section class="panel order-form-panel">
        <div class="panel__head">
          <div>
            <span class="panel__eyebrow">ORDER FORM</span>
            <h2>订单基础信息</h2>
          </div>
          <span class="panel__meta">必填项已标记</span>
        </div>

        <el-alert v-if="submitError" type="error" :title="submitError" :closable="false" show-icon class="section-alert" />

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="order-form">
          <div class="form-grid">
            <el-form-item label="客户" prop="customerId">
              <el-select
                v-model="form.customerId"
                filterable
                remote
                reserve-keyword
                :remote-method="searchCustomers"
                :loading="customerSearchLoading"
                placeholder="输入名称、编码或手机号搜索"
                @change="handleCustomerChange"
              >
                <el-option
                  v-for="customer in customerOptions"
                  :key="customer.id"
                  :label="`${customer.name}（${customer.customerCode}）`"
                  :value="customer.id"
                >
                  <span>{{ customer.name }}</span>
                  <span class="select-option-meta">{{ customer.customerCode }}</span>
                </el-option>
              </el-select>
              <template #extra>
                <span class="field-hint">销售只能选择归属自己的客户；客户状态必须为合作中。</span>
              </template>
            </el-form-item>

            <el-form-item label="财务已录入合同" prop="contractId">
              <el-select
                v-model="form.contractId"
                :disabled="!form.customerId || contractsLoading"
                :loading="contractsLoading"
                placeholder="选择该客户的已录入合同"
                @change="handleContractChange"
              >
                <el-option
                  v-for="contract in contracts"
                  :key="contract.id"
                  :label="`${contract.contractNo} · ${formatMoney(contract.contractAmount, contract.currency)}`"
                  :value="String(contract.id)"
                />
              </el-select>
              <template #extra>
                <span v-if="noAvailableContracts" class="field-hint field-hint--danger">
                  该客户暂无已录入且未到期的合同，请先由财务录入合同。
                </span>
                <span v-else class="field-hint">合同状态必须为“已录入/生效”，金额剩余额度由服务端校验。</span>
              </template>
            </el-form-item>

            <el-form-item label="生产工厂" prop="factoryId">
              <el-select
                v-if="canListFactories"
                v-model="form.factoryId"
                placeholder="选择唯一生产工厂"
                :loading="factoriesLoading"
                filterable
              >
                <el-option
                  v-for="factory in factories"
                  :key="factory.id"
                  :label="`${factory.name}（${factory.code}）`"
                  :value="String(factory.id)"
                />
              </el-select>
              <el-input v-else v-model="form.factoryId" placeholder="输入工厂 ID" />
              <template #extra><span class="field-hint">订单不能跨工厂，后续拆单仅限同厂不同设备。</span></template>
            </el-form-item>

            <el-form-item label="订单金额（元）" prop="totalAmount">
              <el-input v-model="form.totalAmount" placeholder="0.00" inputmode="decimal">
                <template #suffix>元</template>
              </el-input>
              <template #extra>
                <span class="field-hint">
                  按分直接截断，不四舍五入。
                  <template v-if="effectiveCents">将写入 {{ effectiveCents }} 分。</template>
                </span>
              </template>
            </el-form-item>

            <el-form-item label="币种">
              <el-select v-model="form.currency" disabled>
                <el-option label="人民币 CNY" value="CNY" />
              </el-select>
            </el-form-item>
          </div>

          <el-form-item label="备注" prop="remark">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="4"
              maxlength="500"
              show-word-limit
              placeholder="填写交期、工艺或沟通说明；材料成本不在这里录入。"
            />
          </el-form-item>

          <el-alert
            v-if="selectedCustomer && !customerOrderable"
            type="error"
            :closable="false"
            show-icon
            class="section-alert"
            :title="`客户状态为“${customerStatusLabel(selectedCustomer.status)}”，当前不能下单`"
          />

          <div class="form-actions">
            <el-button
              type="primary"
              size="large"
              :loading="submitting"
              :disabled="!customerOrderable || !form.contractId"
              @click="submit"
            >
              <el-icon><CircleCheck /></el-icon>创建订单
            </el-button>
            <el-button size="large" @click="router.push('/orders')">取消</el-button>
          </div>
        </el-form>
      </section>

      <aside class="order-preview">
        <section class="panel preview-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">PREVIEW</span>
              <h2>提交预览</h2>
            </div>
            <el-icon class="preview-icon"><Tickets /></el-icon>
          </div>
          <dl class="preview-list">
            <div>
              <dt>客户</dt>
              <dd>{{ customerLoading ? '加载中…' : selectedCustomer?.name || '未选择' }}</dd>
            </div>
            <div>
              <dt>客户状态</dt>
              <dd>
                <el-tag
                  v-if="selectedCustomer"
                  :type="CUSTOMER_STATUS[selectedCustomer.status]?.type || 'info'"
                  size="small"
                >
                  {{ customerStatusLabel(selectedCustomer.status) }}
                </el-tag>
                <span v-else>—</span>
              </dd>
            </div>
            <div><dt>合同</dt><dd>{{ selectedContract?.contractNo || '未选择' }}</dd></div>
            <div><dt>工厂</dt><dd>{{ selectedFactory?.name || (form.factoryId ? `#${form.factoryId}` : '未选择') }}</dd></div>
            <div><dt>金额</dt><dd>{{ effectiveCents ? `¥${formatCentsPlain(effectiveCents)}` : '待填写' }}</dd></div>
            <div><dt>写入分值</dt><dd class="mono-text">{{ effectiveCents ? `${effectiveCents} 分` : '—' }}</dd></div>
            <div><dt>初始状态</dt><dd><OrderStatusTag status="CREATED" size="small" /></dd></div>
          </dl>
          <div class="preview-note">
            <el-icon><Warning /></el-icon>
            <span>订单号是分片键：库 = order_no % 2，表 = (order_no >> 1) % 4。</span>
          </div>
        </section>

        <section class="panel preview-panel">
          <div class="panel__head">
            <div>
              <span class="panel__eyebrow">CREDIT</span>
              <h2>客户信用</h2>
            </div>
          </div>
          <dl class="preview-list">
            <div><dt>信用额度</dt><dd>{{ formatMoney(selectedCustomer?.creditLimit, selectedCustomer?.currency) }}</dd></div>
            <div><dt>未收应收</dt><dd>{{ formatMoney(customerCredit?.uncollectedReceivable, selectedCustomer?.currency) }}</dd></div>
            <div><dt>最大逾期</dt><dd>{{ customerCredit?.maxOverdueDays ?? 0 }} 天</dd></div>
            <div><dt>账期</dt><dd>{{ selectedCustomer?.paymentDays ?? 0 }} 天</dd></div>
          </dl>
          <div class="preview-note">
            <el-icon><Warning /></el-icon>
            <span>已用额度还会加上未关闭订单占用，由订单服务在下单时汇总。</span>
          </div>
        </section>

        <section class="panel preview-checklist">
          <h3>提交前检查</h3>
          <ul>
            <li :class="selectedCustomer ? 'is-done' : 'is-planned'">
              <el-icon><CircleCheck v-if="selectedCustomer" /><Warning v-else /></el-icon>客户状态与归属
            </li>
            <li :class="form.contractId ? 'is-done' : 'is-planned'">
              <el-icon><CircleCheck v-if="form.contractId" /><Warning v-else /></el-icon>财务已录入合同
            </li>
            <li :class="customerOrderable ? 'is-done' : 'is-planned'">
              <el-icon><CircleCheck v-if="customerOrderable" /><Warning v-else /></el-icon>信用额度与逾期校验
            </li>
            <li class="is-done"><el-icon><CircleCheck /></el-icon>金额按分截断</li>
            <li class="is-done"><el-icon><CircleCheck /></el-icon>单工厂归属</li>
          </ul>
          <p>最终结果以服务端校验为准；校验失败时订单不会写入。</p>
        </section>
      </aside>
    </div>
  </div>
</template>
