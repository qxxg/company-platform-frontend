<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  Box,
  Cpu,
  DataAnalysis,
  House,
  Key,
  MagicStick,
  OfficeBuilding,
  Setting,
  Stamp,
  Tickets,
  User,
  UserFilled,
  Wallet,
  WalletFilled,
} from '@element-plus/icons-vue'
import BrandMark from '@/components/BrandMark.vue'
import { useAuthStore } from '@/stores/auth'
import { ROADMAP_MODULES, ROLE_LABELS } from '@/constants'
import { initialsOf } from '@/utils/format'

defineProps({
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['navigate'])
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const roadmapItems = Object.values(ROADMAP_MODULES).map((item) => ({
  ...item,
  path: `/modules/${item.key}`,
  iconComponent: {
    UserFilled,
    WalletFilled,
    Cpu,
    Box,
    Stamp,
    DataAnalysis,
  }[item.icon],
}))

const activeMenu = computed(() => {
  if (route.name === 'module-roadmap') return `/modules/${route.params.moduleKey}`
  return route.meta.activeMenu || route.path
})

const showOrderMenu = computed(() => auth.hasPermission('order:read') || auth.hasPermission('order:create'))
const showCustomers = computed(() => auth.hasPermission('customer:read'))
const showContracts = computed(() => auth.hasPermission('finance:contract:read'))
const showCredit = computed(() => auth.hasPermission('finance:credit:read'))
const showReceivables = computed(() => auth.hasPermission('finance:receivable:read'))
const showReceipts = computed(() => auth.hasPermission('finance:receipt:read'))
const showInvoices = computed(() => auth.hasPermission('finance:invoice:read'))
const showStatements = computed(() => auth.hasPermission('finance:statement:read'))
const showExpenses = computed(() => auth.hasPermission('finance:expense:read'))
const showLoans = computed(() => auth.hasPermission('finance:loan:read'))
const showUsers = computed(() => auth.hasPermission('system:user:list'))
const showFactories = computed(() => auth.hasPermission('system:factory:list'))
const showEquipment = computed(() => auth.hasPermission('equipment:read'))
const showSchedule = computed(() => auth.hasPermission('production:schedule:read'))
const showQueueJump = computed(() =>
  auth.hasAnyPermission(['production:queue:jump:apply', 'production:queue:jump:approve']),
)
const showMaintenance = computed(() => auth.hasPermission('equipment:maintenance:read'))
const showInspection = computed(() => auth.hasPermission('equipment:inspection:read'))
const showDeviceReport = computed(() => auth.hasPermission('production:report:read'))
const showWarehouse = computed(() => auth.hasPermission('warehouse:read'))
const showApproval = computed(() => auth.hasPermission('approval:read'))
const showAssistant = computed(() => auth.hasPermission('ai:assistant:use'))
const showCockpit = computed(() => auth.hasPermission('bi:cockpit:read'))

const primaryRole = computed(() => ROLE_LABELS[auth.roles[0]] || auth.roles[0] || '普通用户')

function handleSelect(index) {
  if (typeof index !== 'string' || !index.startsWith('/')) return
  if (route.path !== index) router.push(index)
  emit('navigate')
}
</script>

<template>
  <div class="app-sidebar" :class="{ 'app-sidebar--collapsed': collapsed }">
    <button class="app-sidebar__brand" type="button" @click="handleSelect('/dashboard')">
      <BrandMark :size="collapsed ? 34 : 38" />
      <span v-if="!collapsed" class="app-sidebar__brand-text">
        <strong>公司管理系统</strong>
        <small>COMPANY OPERATIONS</small>
      </span>
    </button>

    <div v-if="!collapsed" class="app-sidebar__user">
      <div class="app-sidebar__avatar">{{ initialsOf(auth.displayName) }}</div>
      <div class="app-sidebar__user-text">
        <strong>{{ auth.displayName }}</strong>
        <span>{{ primaryRole }}</span>
      </div>
      <span class="app-sidebar__online" title="会话有效"></span>
    </div>

    <el-scrollbar class="app-sidebar__scroll">
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        :collapse-transition="false"
        :default-openeds="['sub-customers', 'sub-orders', 'sub-production', 'sub-finance', 'sub-warehouse', 'sub-approval', 'sub-roadmap', 'sub-system']"
        class="app-menu"
        @select="handleSelect"
      >
        <el-menu-item index="/dashboard">
          <el-icon><House /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>

        <el-menu-item index="/messages">
          <el-icon><Bell /></el-icon>
          <template #title>消息中心</template>
        </el-menu-item>

        <el-menu-item v-if="showAssistant" index="/assistant">
          <el-icon><MagicStick /></el-icon>
          <template #title>AI 助手</template>
        </el-menu-item>

        <el-menu-item v-if="showCockpit" index="/cockpit">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>经营大屏</template>
        </el-menu-item>

        <el-sub-menu v-if="showCustomers" index="sub-customers">
          <template #title>
            <el-icon><UserFilled /></el-icon>
            <span>客户管理</span>
          </template>
          <el-menu-item index="/customers">客户列表</el-menu-item>
          <el-menu-item v-if="auth.hasPermission('customer:write')" index="/customers/create">新建客户</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="showOrderMenu" index="sub-orders">
          <template #title>
            <el-icon><Tickets /></el-icon>
            <span>订单管理</span>
          </template>
          <el-menu-item v-if="auth.hasPermission('order:read')" index="/orders">订单列表</el-menu-item>
          <el-menu-item v-if="auth.hasPermission('order:create')" index="/orders/create">新建订单</el-menu-item>
        </el-sub-menu>

        <el-sub-menu
          v-if="showEquipment || showSchedule || showQueueJump || showMaintenance || showInspection"
          index="sub-production"
        >
          <template #title>
            <el-icon><Cpu /></el-icon>
            <span>生产管理</span>
          </template>
          <el-menu-item v-if="showEquipment" index="/equipment">设备台账</el-menu-item>
          <el-menu-item v-if="showSchedule" index="/production/schedule">排产队列</el-menu-item>
          <el-menu-item v-if="showMaintenance" index="/production/maintenance">维护工单</el-menu-item>
          <el-menu-item v-if="showInspection" index="/production/inspections">点检保养</el-menu-item>
          <el-menu-item v-if="showDeviceReport" index="/production/device-reports">设备数据上报</el-menu-item>
          <el-menu-item v-if="showQueueJump" index="/production/jump-requests">插队申请</el-menu-item>
        </el-sub-menu>

        <el-sub-menu
          v-if="showContracts || showCredit || showReceivables || showReceipts || showInvoices || showStatements || showExpenses || showLoans"
          index="sub-finance"
        >
          <template #title>
            <el-icon><Wallet /></el-icon>
            <span>财务管理</span>
          </template>
          <el-menu-item v-if="showContracts" index="/finance/contracts">合同管理</el-menu-item>
          <el-menu-item v-if="showReceivables" index="/finance/receivables">应收账款</el-menu-item>
          <el-menu-item v-if="showReceipts" index="/finance/receipts">收款核销</el-menu-item>
          <el-menu-item v-if="showInvoices" index="/finance/invoices">手工开票</el-menu-item>
          <el-menu-item v-if="showStatements" index="/finance/statements">客户对账</el-menu-item>
          <el-menu-item v-if="showExpenses" index="/finance/expenses">费用报销</el-menu-item>
          <el-menu-item v-if="showLoans" index="/finance/loans">借款与还款</el-menu-item>
          <el-menu-item v-if="showCredit" index="/finance/credit">信用看板</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="showWarehouse" index="sub-warehouse">
          <template #title>
            <el-icon><Box /></el-icon>
            <span>仓储管理</span>
          </template>
          <el-menu-item index="/warehouse">仓库与库存</el-menu-item>
          <el-menu-item index="/warehouse/purchase-receipts">采购入库</el-menu-item>
          <el-menu-item index="/warehouse/stock-transfers">跨厂调拨</el-menu-item>
          <el-menu-item index="/warehouse/material-issues">工单领料</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="showApproval" index="sub-approval">
          <template #title>
            <el-icon><Tickets /></el-icon>
            <span>流程审批</span>
          </template>
          <el-menu-item index="/approval">审批中心</el-menu-item>
          <el-menu-item index="/approval/definitions">审批流程与档位</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="sub-roadmap">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>业务模块</span>
          </template>
          <el-menu-item v-for="item in roadmapItems" :key="item.path" :index="item.path">
            <el-icon><component :is="item.iconComponent" /></el-icon>
            <template #title>
              <span>{{ item.name }}</span>
              <span class="menu-badge" :class="{ 'menu-badge--partial': item.state === 'partial' }">
                {{ item.state === 'partial' ? '进行中' : '规划' }}
              </span>
            </template>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="sub-system">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统管理</span>
          </template>
          <el-menu-item v-if="showUsers" index="/system/users">
            <el-icon><User /></el-icon>
            <template #title>用户账号</template>
          </el-menu-item>
          <el-menu-item v-if="showFactories" index="/system/factories">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>工厂组织</template>
          </el-menu-item>
          <el-menu-item index="/system/permissions">
            <el-icon><Key /></el-icon>
            <template #title>角色与权限</template>
          </el-menu-item>
        </el-sub-menu>

        <el-menu-item index="/profile">
          <el-icon><UserFilled /></el-icon>
          <template #title>个人中心</template>
        </el-menu-item>
      </el-menu>
    </el-scrollbar>

    <div v-if="!collapsed" class="app-sidebar__footer">
      <div class="app-sidebar__footer-line">
        <span class="dot dot--green"></span>
        <span>统一认证已连接</span>
      </div>
      <small>V1.4 基础版 · PC Web</small>
    </div>
  </div>
</template>
