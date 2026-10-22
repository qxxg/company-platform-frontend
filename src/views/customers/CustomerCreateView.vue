<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Back, CircleCheck } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { createCustomer } from '@/api/customer'
import { fetchFactories } from '@/api/system'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/errors'
import { yuanToCents } from '@/utils/money'
import {
  CUSTOMER_SOURCE_OPTIONS,
  CUSTOMER_STATUS_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  RISK_LEVEL_OPTIONS,
  SETTLEMENT_METHOD_OPTIONS,
} from '@/constants'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const submitting = ref(false)
const submitError = ref('')
const factories = ref([])

const form = reactive({
  customerCode: '',
  name: '',
  shortName: '',
  customerType: 'ENTERPRISE',
  creditCode: '',
  industry: '',
  region: '',
  source: 'EXHIBITION',
  ownerUserId: String(auth.userId || ''),
  ownerName: auth.displayName,
  department: '',
  contactName: '',
  contactTitle: '',
  contactPhone: '',
  contactEmail: '',
  contactWechat: '',
  address: '',
  billingTitle: '',
  taxNo: '',
  bankName: '',
  bankAccount: '',
  settlementMethod: 'MONTHLY',
  paymentDays: 30,
  creditLimit: '',
  defaultTaxRate: 0.13,
  currency: 'CNY',
  defaultFactoryId: '',
  status: 'COOPERATING',
  riskLevel: 'NORMAL',
  firstCooperationDate: '',
  remark: '',
})

const canSetCredit = computed(() => auth.roles.some((role) => ['ADMIN', 'FINANCE'].includes(role)))
const canListFactories = computed(() => auth.hasPermission('system:factory:list'))

const rules = {
  name: [{ required: true, message: '请输入客户全称', trigger: 'blur' }],
  source: [{ required: true, message: '请选择客户来源', trigger: 'change' }],
  ownerUserId: [{ required: true, message: '请输入归属业务员用户 ID', trigger: 'blur' }],
  contactPhone: [
    {
      validator: (_rule, value, callback) => {
        if (value && !/^[0-9+\-\s()]{6,32}$/.test(value)) {
          callback(new Error('手机号格式不正确'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  creditLimit: [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback()
          return
        }
        try {
          yuanToCents(value)
          callback()
        } catch {
          callback(new Error('信用额度必须是不小于 0 的数字'))
        }
      },
      trigger: 'blur',
    },
  ],
}

async function loadFactories() {
  if (!canListFactories.value) return
  try {
    factories.value = (await fetchFactories()) || []
  } catch {
    factories.value = []
  }
}

async function submit() {
  submitError.value = ''
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    const payload = {
      ...form,
      customerCode: form.customerCode.trim() || null,
      name: form.name.trim(),
      shortName: form.shortName.trim() || null,
      creditCode: form.creditCode.trim() || null,
      industry: form.industry.trim() || null,
      region: form.region.trim() || null,
      ownerUserId: form.ownerUserId,
      ownerName: form.ownerName.trim() || null,
      department: form.department.trim() || null,
      contactName: form.contactName.trim() || null,
      contactTitle: form.contactTitle.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      contactWechat: form.contactWechat.trim() || null,
      address: form.address.trim() || null,
      billingTitle: form.billingTitle.trim() || null,
      taxNo: form.taxNo.trim() || null,
      bankName: form.bankName.trim() || null,
      bankAccount: form.bankAccount.trim() || null,
      creditLimit: canSetCredit.value && form.creditLimit ? yuanToCents(form.creditLimit) : 0,
      defaultFactoryId: form.defaultFactoryId || null,
      firstCooperationDate: form.firstCooperationDate || null,
      remark: form.remark.trim() || null,
    }
    const created = await createCustomer(payload)
    ElMessage.success('客户已创建')
    router.replace({ name: 'customer-detail', params: { id: created.id } })
  } catch (error) {
    submitError.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

onMounted(loadFactories)
</script>

<template>
  <div class="page-stack">
    <PageHeader
      eyebrow="CUSTOMER MANAGEMENT"
      title="新建客户"
      description="客户来源和归属业务员必填；客户名称、信用额度、结算方式变更后续需走审批。"
    >
      <template #actions>
        <el-button @click="router.push('/customers')">
          <el-icon><Back /></el-icon>返回列表
        </el-button>
      </template>
    </PageHeader>

    <el-alert type="info" :closable="false" show-icon class="section-alert" title="权限与数据范围">
      <template #default>
        销售只能把客户归属到自己名下，且不能直接设置信用额度；管理员和财务可以指定归属与额度。
        信用额度为 0 的客户不能赊销下单。
      </template>
    </el-alert>

    <el-alert v-if="submitError" type="error" :title="submitError" :closable="false" show-icon class="section-alert" />

    <section class="panel order-form-panel">
      <div class="panel__head">
        <div>
          <span class="panel__eyebrow">CUSTOMER FORM</span>
          <h2>客户基础档案</h2>
        </div>
        <span class="panel__meta">带 * 为必填</span>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="order-form">
        <h3 class="form-section-title">基本信息</h3>
        <div class="form-grid">
          <el-form-item label="客户编码">
            <el-input v-model="form.customerCode" placeholder="留空由系统生成" maxlength="32" />
          </el-form-item>
          <el-form-item label="客户全称" prop="name">
            <el-input v-model="form.name" placeholder="营业执照名称" maxlength="128" />
          </el-form-item>
          <el-form-item label="客户简称">
            <el-input v-model="form.shortName" placeholder="列表和订单展示用" maxlength="64" />
          </el-form-item>
          <el-form-item label="客户类型">
            <el-select v-model="form.customerType">
              <el-option v-for="item in CUSTOMER_TYPE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="统一社会信用代码">
            <el-input v-model="form.creditCode" placeholder="查重和开票使用" maxlength="32" />
          </el-form-item>
          <el-form-item label="行业">
            <el-input v-model="form.industry" maxlength="64" />
          </el-form-item>
          <el-form-item label="区域">
            <el-input v-model="form.region" maxlength="64" />
          </el-form-item>
          <el-form-item label="首次合作日期">
            <el-date-picker
              v-model="form.firstCooperationDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <h3 class="form-section-title">来源与归属</h3>
        <div class="form-grid">
          <el-form-item label="客户来源" prop="source">
            <el-select v-model="form.source">
              <el-option
                v-for="item in CUSTOMER_SOURCE_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="归属业务员用户 ID" prop="ownerUserId">
            <el-input v-model="form.ownerUserId" :disabled="!canSetCredit" placeholder="如 2" />
            <template #extra>
              <span class="field-hint">销售角色固定为当前登录人；管理员/财务可指定。</span>
            </template>
          </el-form-item>
          <el-form-item label="归属业务员姓名">
            <el-input v-model="form.ownerName" maxlength="64" :disabled="!canSetCredit" />
          </el-form-item>
          <el-form-item label="归属部门">
            <el-input v-model="form.department" maxlength="64" />
          </el-form-item>
          <el-form-item label="客户状态">
            <el-select v-model="form.status">
              <el-option
                v-for="item in CUSTOMER_STATUS_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <template #extra><span class="field-hint">只有“合作中”客户允许下单。</span></template>
          </el-form-item>
          <el-form-item label="风险等级">
            <el-select v-model="form.riskLevel">
              <el-option v-for="item in RISK_LEVEL_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>

        <h3 class="form-section-title">联系信息</h3>
        <div class="form-grid">
          <el-form-item label="主联系人">
            <el-input v-model="form.contactName" maxlength="64" />
          </el-form-item>
          <el-form-item label="职务">
            <el-input v-model="form.contactTitle" maxlength="64" />
          </el-form-item>
          <el-form-item label="手机号" prop="contactPhone">
            <el-input v-model="form.contactPhone" maxlength="32" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input v-model="form.contactEmail" maxlength="128" />
          </el-form-item>
          <el-form-item label="微信">
            <el-input v-model="form.contactWechat" maxlength="64" />
          </el-form-item>
          <el-form-item label="收货/对账地址">
            <el-input v-model="form.address" maxlength="255" />
          </el-form-item>
        </div>

        <h3 class="form-section-title">商务与信用</h3>
        <div class="form-grid">
          <el-form-item label="结算方式">
            <el-select v-model="form.settlementMethod">
              <el-option
                v-for="item in SETTLEMENT_METHOD_OPTIONS"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="账期（天）">
            <el-input-number v-model="form.paymentDays" :min="0" :max="365" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item v-if="canSetCredit" label="信用额度（元）" prop="creditLimit">
            <el-input v-model="form.creditLimit" placeholder="0.00，0 表示未授信" inputmode="decimal" />
            <template #extra><span class="field-hint">以分存储，小数直接截断。</span></template>
          </el-form-item>
          <el-form-item label="默认税率">
            <el-input-number
              v-model="form.defaultTaxRate"
              :min="0"
              :max="1"
              :step="0.01"
              :precision="4"
              controls-position="right"
              style="width: 100%"
              :disabled="!canSetCredit"
            />
          </el-form-item>
          <el-form-item label="币种">
            <el-select v-model="form.currency">
              <el-option label="人民币 CNY" value="CNY" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="canListFactories" label="常用生产工厂">
            <el-select v-model="form.defaultFactoryId" placeholder="可不选" clearable>
              <el-option
                v-for="factory in factories"
                :key="factory.id"
                :label="`${factory.name}（${factory.code}）`"
                :value="String(factory.id)"
              />
            </el-select>
          </el-form-item>
        </div>

        <h3 class="form-section-title">开票信息</h3>
        <div class="form-grid">
          <el-form-item label="开票抬头">
            <el-input v-model="form.billingTitle" maxlength="128" :disabled="!canSetCredit" />
          </el-form-item>
          <el-form-item label="纳税人识别号">
            <el-input v-model="form.taxNo" maxlength="32" :disabled="!canSetCredit" />
          </el-form-item>
          <el-form-item label="开户行">
            <el-input v-model="form.bankName" maxlength="128" :disabled="!canSetCredit" />
          </el-form-item>
          <el-form-item label="银行账号">
            <el-input v-model="form.bankAccount" maxlength="64" :disabled="!canSetCredit" />
          </el-form-item>
        </div>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="500" show-word-limit />
        </el-form-item>

        <div class="form-actions">
          <el-button type="primary" size="large" :loading="submitting" @click="submit">
            <el-icon><CircleCheck /></el-icon>保存客户
          </el-button>
          <el-button size="large" @click="router.push('/customers')">取消</el-button>
        </div>
      </el-form>
    </section>
  </div>
</template>
