import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const MainLayout = () => import('@/layouts/MainLayout.vue')

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/login/oauth2/code/pc-web',
    name: 'oauth-callback',
    component: () => import('@/views/OAuthCallbackView.vue'),
    meta: { public: true, title: '统一认证登录' },
  },
  {
    path: '/cockpit',
    name: 'cockpit',
    component: () => import('@/views/CockpitView.vue'),
    meta: { title: '经营大屏', permission: 'bi:cockpit:read' },
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '工作台', activeMenu: '/dashboard' },
      },
      {
        path: 'customers',
        name: 'customers',
        component: () => import('@/views/customers/CustomerListView.vue'),
        meta: { title: '客户列表', activeMenu: '/customers', permission: 'customer:read' },
      },
      {
        path: 'customers/create',
        name: 'customer-create',
        component: () => import('@/views/customers/CustomerCreateView.vue'),
        meta: { title: '新建客户', activeMenu: '/customers', permission: 'customer:write' },
      },
      {
        path: 'customers/:id',
        name: 'customer-detail',
        component: () => import('@/views/customers/CustomerDetailView.vue'),
        meta: { title: '客户详情', activeMenu: '/customers', permission: 'customer:read' },
      },
      {
        path: 'finance/credit',
        name: 'finance-credit',
        component: () => import('@/views/finance/CreditOverviewView.vue'),
        meta: { title: '信用看板', activeMenu: '/finance/credit', permission: 'finance:credit:read' },
      },
      {
        path: 'finance/receivables',
        name: 'finance-receivables',
        component: () => import('@/views/finance/ReceivableListView.vue'),
        meta: { title: '应收账款', activeMenu: '/finance/receivables', permission: 'finance:receivable:read' },
      },
      {
        path: 'finance/receipts',
        name: 'finance-receipts',
        component: () => import('@/views/finance/ReceiptListView.vue'),
        meta: { title: '收款核销', activeMenu: '/finance/receipts', permission: 'finance:receipt:read' },
      },
      {
        path: 'finance/invoices',
        name: 'finance-invoices',
        component: () => import('@/views/finance/InvoiceListView.vue'),
        meta: { title: '手工开票', activeMenu: '/finance/invoices', permission: 'finance:invoice:read' },
      },
      {
        path: 'finance/statements',
        name: 'finance-statements',
        component: () => import('@/views/finance/StatementListView.vue'),
        meta: { title: '客户对账', activeMenu: '/finance/statements', permission: 'finance:statement:read' },
      },
      {
        path: 'finance/expenses',
        name: 'finance-expenses',
        component: () => import('@/views/finance/ExpenseListView.vue'),
        meta: { title: '费用报销', activeMenu: '/finance/expenses', permission: 'finance:expense:read' },
      },
      {
        path: 'finance/loans',
        name: 'finance-loans',
        component: () => import('@/views/finance/LoanListView.vue'),
        meta: { title: '借款与还款', activeMenu: '/finance/loans', permission: 'finance:loan:read' },
      },
      {
        path: 'finance/contracts',
        name: 'finance-contracts',
        component: () => import('@/views/finance/ContractListView.vue'),
        meta: { title: '合同管理', activeMenu: '/finance/contracts', permission: 'finance:contract:read' },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/orders/OrderListView.vue'),
        meta: { title: '订单列表', activeMenu: '/orders', permission: 'order:read' },
      },
      {
        path: 'orders/create',
        name: 'order-create',
        component: () => import('@/views/orders/OrderCreateView.vue'),
        meta: { title: '新建订单', activeMenu: '/orders', permission: 'order:create' },
      },
      {
        path: 'orders/:orderNo',
        name: 'order-detail',
        component: () => import('@/views/orders/OrderDetailView.vue'),
        meta: { title: '订单详情', activeMenu: '/orders', permission: 'order:read' },
      },
      {
        path: 'equipment',
        name: 'equipment-ledger',
        component: () => import('@/views/production/EquipmentListView.vue'),
        meta: { title: '设备台账', activeMenu: '/equipment', permission: 'equipment:read' },
      },
      {
        path: 'production/schedule',
        name: 'production-schedule',
        component: () => import('@/views/production/ProductionScheduleView.vue'),
        meta: {
          title: '排产队列',
          activeMenu: '/production/schedule',
          permission: 'production:schedule:read',
        },
      },
      {
        path: 'production/jump-requests',
        name: 'production-jump-requests',
        component: () => import('@/views/production/QueueJumpView.vue'),
        meta: {
          title: '插队申请',
          activeMenu: '/production/jump-requests',
          permissions: ['production:queue:jump:apply', 'production:queue:jump:approve'],
        },
      },
      {
        path: 'production/maintenance',
        name: 'production-maintenance',
        component: () => import('@/views/production/MaintenanceListView.vue'),
        meta: {
          title: '维护工单',
          activeMenu: '/production/maintenance',
          permission: 'equipment:maintenance:read',
        },
      },
      {
        path: 'production/device-reports',
        name: 'production-device-reports',
        component: () => import('@/views/production/DeviceReportView.vue'),
        meta: {
          title: '设备数据上报',
          activeMenu: '/production/device-reports',
          permission: 'production:report:read',
        },
      },
      {
        path: 'production/inspections',
        name: 'production-inspections',
        component: () => import('@/views/production/InspectionListView.vue'),
        meta: {
          title: '点检保养',
          activeMenu: '/production/inspections',
          permission: 'equipment:inspection:read',
        },
      },
      {
        path: 'warehouse',
        name: 'warehouse',
        component: () => import('@/views/warehouse/WarehouseView.vue'),
        meta: { title: '仓储管理', activeMenu: '/warehouse', permission: 'warehouse:read' },
      },
      {
        path: 'warehouse/purchase-receipts',
        name: 'warehouse-purchase-receipts',
        component: () => import('@/views/warehouse/PurchaseReceiptListView.vue'),
        meta: {
          title: '采购入库',
          activeMenu: '/warehouse/purchase-receipts',
          permission: 'warehouse:read',
        },
      },
      {
        path: 'warehouse/stock-transfers',
        name: 'warehouse-stock-transfers',
        component: () => import('@/views/warehouse/StockTransferListView.vue'),
        meta: {
          title: '跨厂调拨',
          activeMenu: '/warehouse/stock-transfers',
          permission: 'warehouse:read',
        },
      },
      {
        path: 'warehouse/material-issues',
        name: 'warehouse-material-issues',
        component: () => import('@/views/warehouse/MaterialIssueListView.vue'),
        meta: {
          title: '工单领料',
          activeMenu: '/warehouse/material-issues',
          permission: 'warehouse:read',
        },
      },
      {
        path: 'approval',
        name: 'approval-center',
        component: () => import('@/views/approval/ApprovalCenterView.vue'),
        meta: { title: '审批中心', activeMenu: '/approval', permission: 'approval:read' },
      },
      {
        path: 'approval/definitions',
        name: 'approval-definitions',
        component: () => import('@/views/approval/ApprovalDefinitionView.vue'),
        meta: { title: '审批流程与档位', activeMenu: '/approval/definitions', permission: 'approval:read' },
      },
      {
        path: 'assistant',
        name: 'ai-assistant',
        component: () => import('@/views/ai/AssistantView.vue'),
        meta: {
          title: 'AI 助手',
          activeMenu: '/assistant',
          permission: 'ai:assistant:use',
        },
      },
      {
        path: 'messages',
        name: 'messages',
        component: () => import('@/views/messages/MessageCenterView.vue'),
        meta: { title: '消息中心', activeMenu: '/messages' },
      },
      {
        path: 'system/users',
        name: 'system-users',
        component: () => import('@/views/system/UserListView.vue'),
        meta: { title: '用户账号', activeMenu: '/system/users', permission: 'system:user:list' },
      },
      {
        path: 'system/factories',
        name: 'system-factories',
        component: () => import('@/views/system/FactoryListView.vue'),
        meta: { title: '工厂组织', activeMenu: '/system/factories', permission: 'system:factory:list' },
      },
      {
        path: 'system/permissions',
        name: 'system-permissions',
        component: () => import('@/views/PermissionsView.vue'),
        meta: { title: '角色与权限', activeMenu: '/system/permissions' },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/ProfileView.vue'),
        meta: { title: '个人中心', activeMenu: '/profile' },
      },
      {
        path: 'modules/:moduleKey',
        name: 'module-roadmap',
        component: () => import('@/views/roadmap/ModuleRoadmapView.vue'),
        meta: { title: '业务模块', activeMenu: 'roadmap' },
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('@/views/ForbiddenView.vue'),
        meta: { title: '无访问权限' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // 已登录用户访问登录页时直接回到工作台；回调页必须放行以完成令牌交换。
    if (to.name === 'login' && auth.isAuthenticated) {
      return { name: 'dashboard' }
    }
    return true
  }

  if (!auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath, reason: 'login-required' },
    }
  }

  if (to.meta.permission && !auth.hasPermission(to.meta.permission)) {
    return { name: 'forbidden', query: { from: to.fullPath, permission: to.meta.permission } }
  }

  if (Array.isArray(to.meta.permissions) && to.meta.permissions.length
    && !to.meta.permissions.some((permission) => auth.hasPermission(permission))) {
    return {
      name: 'forbidden',
      query: { from: to.fullPath, permission: to.meta.permissions.join(' / ') },
    }
  }

  return true
})

router.afterEach((to) => {
  const title = to.meta?.title ? `${to.meta.title} · 公司管理系统` : '公司管理系统'
  document.title = title
})

export default router
