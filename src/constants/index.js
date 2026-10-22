/**
 * 前端共享常量。
 *
 * 所有编码都以后端 V1.4 规划为准；页面只负责展示，不在这里推导业务规则。
 */

export const ROLE_LABELS = {
  ADMIN: '系统管理员',
  SALES: '销售',
  FINANCE: '财务',
  FACTORY_MANAGER: '厂长',
  OPERATOR: '操作员',
}

export const PERMISSION_LABELS = {
  'system:user:list': '查看用户',
  'system:user:create': '创建用户',
  'system:factory:list': '查看工厂',
  'order:read': '查看订单',
  'order:create': '创建订单',
  'order:approve': '订单审批',
  'finance:contract:read': '查看合同',
  'finance:contract:write': '录入合同',
  'finance:credit:read': '查看客户信用',
  'finance:receivable:read': '查看应收账款',
  'finance:receivable:write': '登记应收账款',
  'finance:receipt:read': '查看收款单',
  'finance:receipt:write': '登记收款与核销',
  'finance:invoice:read': '查看开票记录',
  'finance:invoice:write': '登记手工开票',
  'finance:statement:read': '查看客户对账单',
  'finance:statement:write': '生成与确认对账单',
  'warehouse:inbound': '入库',
  'warehouse:outbound': '出库',
  'equipment:read': '查看设备',
  'equipment:write': '维护设备',
  'production:schedule:read': '查看排产队列',
  'production:schedule:write': '工单排产与队列操作',
  'production:queue:jump:apply': '申请设备队列插队',
  'production:queue:jump:approve': '审批设备队列插队',
  'customer:read': '查看客户',
  'customer:write': '维护客户',
  'approval:read': '查看审批',
  'approval:approve': '审批',
  'approval:submit': '提交审批申请',
  'approval:manage': '维护审批流程与档位',
  'approval:apply': '执行审批通过后的业务变更',
  'ai:assistant:use': '使用 AI 助手',
  'bi:dashboard:read': '查看经营看板',
  'bi:cockpit:read': '查看经营大屏',
  'bi:cost:read': '查看成本毛利指标',
  'bi:etl:run': '触发 BI 数据同步',
}

export const PERMISSION_GROUPS = [
  {
    key: 'system',
    title: '系统管理',
    description: '账号、组织与工厂基础数据',
    permissions: ['system:user:list', 'system:user:create', 'system:factory:list'],
  },
  {
    key: 'order',
    title: '订单管理',
    description: '订单查询、创建与审批',
    permissions: ['order:read', 'order:create', 'order:approve'],
  },
  {
    key: 'finance',
    title: '财务管理',
    description: '合同、信用、应收与收款核销',
    permissions: [
      'finance:contract:read',
      'finance:contract:write',
      'finance:credit:read',
      'finance:receivable:read',
      'finance:receivable:write',
      'finance:receipt:read',
      'finance:receipt:write',
      'finance:invoice:read',
      'finance:invoice:write',
      'finance:statement:read',
      'finance:statement:write',
    ],
  },
  {
    key: 'warehouse',
    title: '仓储管理',
    description: '出入库操作',
    permissions: ['warehouse:inbound', 'warehouse:outbound'],
  },
  {
    key: 'equipment',
    title: '设备管理',
    description: '设备台账、能力参数与状态',
    permissions: ['equipment:read', 'equipment:write'],
  },
  {
    key: 'production',
    title: '生产排产',
    description: '工单、设备队列与插队审批',
    permissions: [
      'production:schedule:read',
      'production:schedule:write',
      'production:queue:jump:apply',
      'production:queue:jump:approve',
    ],
  },
  {
    key: 'customer',
    title: '客户管理',
    description: '客户档案与归属维护',
    permissions: ['customer:read', 'customer:write'],
  },
  {
    key: 'approval',
    title: '审批中心',
    description: '审批查看与处理',
    permissions: ['approval:read', 'approval:approve'],
  },
  {
    key: 'bi',
    title: '经营看板',
    description: '首页工作台、经营大屏与指标口径',
    permissions: ['bi:dashboard:read', 'bi:cockpit:read', 'bi:cost:read'],
  },
]

export const ORDER_STATUS = {
  CREATED: { label: '已创建', type: 'info', description: '订单已通过合同与信用校验，等待排产' },
  QUEUED: { label: '排队中', type: 'warning', description: '已分配工厂，等待设备空闲' },
  IN_PRODUCTION: { label: '生产中', type: 'primary', description: '设备正在执行该订单' },
  COMPLETED: { label: '已完成', type: 'success', description: '生产与发货流程已完成' },
  CANCELLED: { label: '已取消', type: 'danger', description: '订单已取消' },
}

/** 设备状态，与后端 t_device.status 保持一致。 */
export const DEVICE_STATUS = {
  IDLE: { label: '空闲', type: 'success', description: '可接受排产，也可继续排队' },
  RUNNING: { label: '生产中', type: 'primary', description: '正在执行一个工单，仍可接受后续排队' },
  MAINTENANCE: { label: '保养中', type: 'warning', description: '等待队列保留，恢复空闲后才能开始' },
  FAULT: { label: '故障维修', type: 'danger', description: '等待队列保留，需设备管理员处理' },
  DISABLED: { label: '停用', type: 'info', description: '不参与排产，台账保留' },
}

export const DEVICE_STATUS_OPTIONS = Object.entries(DEVICE_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 设备状态变更接口只允许人工设置这些状态；RUNNING 由开始工单自动进入。 */
export const MANUAL_DEVICE_STATUS_OPTIONS = DEVICE_STATUS_OPTIONS.filter(
  (item) => item.value !== 'RUNNING',
)

/** 工单状态，与后端 t_work_order.status 保持一致。 */
export const WORK_ORDER_STATUS = {
  PENDING: { label: '待排产', type: 'info' },
  QUEUED: { label: '排队中', type: 'warning' },
  RUNNING: { label: '生产中', type: 'primary' },
  COMPLETED: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const WORK_ORDER_STATUS_OPTIONS = Object.entries(WORK_ORDER_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 设备队列记录状态。 */
export const QUEUE_STATUS = {
  WAITING: { label: '等待中', type: 'warning' },
  RUNNING: { label: '生产中', type: 'primary' },
  DONE: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

/** 插队申请状态；审批中心上线前使用独立审批接口。 */
export const QUEUE_JUMP_STATUS = {
  PENDING: { label: '待审批', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
  CANCELLED: { label: '已撤销', type: 'info' },
}

export const QUEUE_JUMP_STATUS_OPTIONS = Object.entries(QUEUE_JUMP_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

export function deviceStatusLabel(value) {
  return DEVICE_STATUS[value]?.label || value || '—'
}

export function workOrderStatusLabel(value) {
  return WORK_ORDER_STATUS[value]?.label || value || '—'
}

export function queueJumpStatusLabel(value) {
  return QUEUE_JUMP_STATUS[value]?.label || value || '—'
}

/** 维护工单状态，与后端 t_maintenance_order.status 保持一致。 */
export const MAINTENANCE_STATUS = {
  PENDING: { label: '待处理', type: 'warning' },
  IN_PROGRESS: { label: '执行中', type: 'primary' },
  COMPLETED: { label: '已完成', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const MAINTENANCE_STATUS_OPTIONS = Object.entries(MAINTENANCE_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 维护类型：预防性保养 / 故障维修 / 点检整改。 */
export const MAINTENANCE_TYPE = {
  PREVENTIVE: { label: '预防性保养', type: 'success' },
  REPAIR: { label: '故障维修', type: 'danger' },
  INSPECTION: { label: '点检整改', type: 'warning' },
}

export const MAINTENANCE_TYPE_OPTIONS = Object.entries(MAINTENANCE_TYPE).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 维护优先级。 */
export const MAINTENANCE_PRIORITY = {
  LOW: { label: '低', type: 'info' },
  NORMAL: { label: '普通', type: 'primary' },
  HIGH: { label: '高', type: 'warning' },
  URGENT: { label: '紧急', type: 'danger' },
}

export const MAINTENANCE_PRIORITY_OPTIONS = Object.entries(MAINTENANCE_PRIORITY).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 点检周期。 */
export const INSPECTION_PLAN_TYPE = {
  DAILY: { label: '日常点检', type: 'info' },
  WEEKLY: { label: '周点检', type: 'primary' },
  MONTHLY: { label: '月度保养检查', type: 'warning' },
}

export const INSPECTION_PLAN_TYPE_OPTIONS = Object.entries(INSPECTION_PLAN_TYPE).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 点检结果。 */
export const INSPECTION_RESULT = {
  NORMAL: { label: '正常', type: 'success' },
  ABNORMAL: { label: '异常', type: 'danger' },
}

export const INSPECTION_RESULT_OPTIONS = Object.entries(INSPECTION_RESULT).map(([value, item]) => ({
  value,
  label: item.label,
}))

export function maintenanceStatusLabel(value) {
  return MAINTENANCE_STATUS[value]?.label || value || '—'
}

export function maintenanceTypeLabel(value) {
  return MAINTENANCE_TYPE[value]?.label || value || '—'
}

export function inspectionResultLabel(value) {
  return INSPECTION_RESULT[value]?.label || value || '—'
}

/** 仓库类型，与后端 t_warehouse.warehouse_type 保持一致。 */
export const WAREHOUSE_TYPE = {
  MAIN: { label: '主仓', type: 'primary' },
  FEEDING: { label: '备料仓', type: 'warning' },
  RETURN: { label: '退货仓', type: 'info' },
}

export const WAREHOUSE_TYPE_OPTIONS = Object.entries(WAREHOUSE_TYPE).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 仓库状态。 */
export const WAREHOUSE_STATUS = {
  ACTIVE: { label: '启用', type: 'success' },
  DISABLED: { label: '停用', type: 'info' },
}

export const WAREHOUSE_STATUS_OPTIONS = Object.entries(WAREHOUSE_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 物料类型。 */
export const MATERIAL_TYPE = {
  FABRIC: { label: '布料', type: 'primary' },
  CHEMICAL: { label: '化工', type: 'warning' },
  ACCESSORY: { label: '辅料', type: 'info' },
}

export const MATERIAL_TYPE_OPTIONS = Object.entries(MATERIAL_TYPE).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 采购入库单状态。 */
export const PURCHASE_RECEIPT_STATUS = {
  DRAFT: { label: '待收货', type: 'warning' },
  RECEIVED: { label: '已入库', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const PURCHASE_RECEIPT_STATUS_OPTIONS = Object.entries(PURCHASE_RECEIPT_STATUS).map(
  ([value, item]) => ({ value, label: item.label }),
)

/** 跨厂调拨单状态。 */
export const STOCK_TRANSFER_STATUS = {
  PENDING: { label: '待出库', type: 'warning' },
  IN_TRANSIT: { label: '在途', type: 'primary' },
  COMPLETED: { label: '已入库', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const STOCK_TRANSFER_STATUS_OPTIONS = Object.entries(STOCK_TRANSFER_STATUS).map(
  ([value, item]) => ({ value, label: item.label }),
)

export function purchaseReceiptStatusLabel(value) {
  return PURCHASE_RECEIPT_STATUS[value]?.label || value || '—'
}

export function stockTransferStatusLabel(value) {
  return STOCK_TRANSFER_STATUS[value]?.label || value || '—'
}

/** 工单领料单状态。 */
export const MATERIAL_ISSUE_STATUS = {
  PENDING: { label: '待发料', type: 'warning' },
  COMPLETED: { label: '已发料', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const MATERIAL_ISSUE_STATUS_OPTIONS = Object.entries(MATERIAL_ISSUE_STATUS).map(
  ([value, item]) => ({ value, label: item.label }),
)

export function materialIssueStatusLabel(value) {
  return MATERIAL_ISSUE_STATUS[value]?.label || value || '—'
}

/** 审批单状态，与后端 approval_instance.status 保持一致。 */
export const APPROVAL_STATUS = {
  PENDING: { label: '待审批', type: 'warning' },
  APPROVED: { label: '已通过', type: 'success' },
  REJECTED: { label: '已驳回', type: 'danger' },
  CANCELLED: { label: '已撤销', type: 'info' },
}

export const APPROVAL_STATUS_OPTIONS = Object.entries(APPROVAL_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 审批业务类型。 */
export const APPROVAL_BUSINESS_TYPE = {
  CREDIT_LIMIT: { label: '信用额度调整', type: 'primary' },
  INVOICE_VOID: { label: '发票作废/红冲', type: 'warning' },
  EXPENSE: { label: '费用报销', type: 'success' },
  LOAN: { label: '借款/还款', type: 'warning' },
  QUEUE_JUMP: { label: '设备队列插队', type: 'info' },
  WAREHOUSE: { label: '仓储单据', type: 'info' },
}

export const APPROVAL_BUSINESS_TYPE_OPTIONS = Object.entries(APPROVAL_BUSINESS_TYPE).map(
  ([value, item]) => ({ value, label: item.label }),
)

export function approvalStatusLabel(value) {
  return APPROVAL_STATUS[value]?.label || value || '—'
}

export function approvalBusinessTypeLabel(value) {
  return APPROVAL_BUSINESS_TYPE[value]?.label || value || '—'
}

/** 站内消息类型，与后端 StationMessageService 常量保持一致。 */
export const MESSAGE_TYPE = {
  QUEUE_DISPLACED: { label: '排队被顺延', type: 'warning' },
  QUEUE_JUMP_RESULT: { label: '插队审批结果', type: 'primary' },
  SYSTEM: { label: '系统提醒', type: 'danger' },
}

export function messageTypeLabel(value) {
  return MESSAGE_TYPE[value]?.label || value || '通知'
}

/** 客户状态，与后端 biz_customer.status 保持一致。 */
export const CUSTOMER_STATUS = {
  PROSPECT: { label: '潜在客户', type: 'info' },
  COOPERATING: { label: '合作中', type: 'success' },
  SUSPENDED: { label: '暂停合作', type: 'warning' },
  LOST: { label: '已流失', type: 'danger' },
  BLACKLIST: { label: '黑名单', type: 'danger' },
}

export const CUSTOMER_STATUS_OPTIONS = Object.entries(CUSTOMER_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 客户来源字典；后续可由后台字典表维护。 */
export const CUSTOMER_SOURCE_OPTIONS = [
  { value: 'EXHIBITION', label: '展会' },
  { value: 'REFERRAL', label: '老客户转介绍' },
  { value: 'VISIT', label: '业务员拜访' },
  { value: 'PHONE', label: '电话开发' },
  { value: 'ONLINE', label: '线上咨询' },
  { value: 'ASSOCIATION', label: '行业协会' },
  { value: 'ADVERTISING', label: '广告投放' },
  { value: 'OTHER', label: '其他' },
]

export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'ENTERPRISE', label: '企业客户' },
  { value: 'INDIVIDUAL', label: '个人客户' },
  { value: 'OTHER', label: '其他' },
]

export const SETTLEMENT_METHOD_OPTIONS = [
  { value: 'PREPAID', label: '预付' },
  { value: 'MONTHLY', label: '月结' },
  { value: 'ACCEPTANCE', label: '承兑' },
  { value: 'OTHER', label: '其他' },
]

export const RISK_LEVEL_OPTIONS = [
  { value: 'NORMAL', label: '正常' },
  { value: 'WATCH', label: '关注' },
  { value: 'HIGH', label: '高风险' },
]

/** 合同状态，与 V1.4 合同流程一致。 */
export const CONTRACT_STATUS = {
  PENDING_ENTRY: { label: '待财务录入', type: 'warning' },
  ENTERED: { label: '已录入', type: 'success' },
  ACTIVE: { label: '生效', type: 'success' },
  CHANGING: { label: '变更中', type: 'warning' },
  EXPIRED: { label: '已到期', type: 'info' },
  TERMINATED: { label: '已终止', type: 'danger' },
}

export const CONTRACT_STATUS_OPTIONS = Object.entries(CONTRACT_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

export const CONTRACT_TYPE_OPTIONS = [
  { value: 'PROCESSING', label: '加工合同' },
  { value: 'FRAMEWORK', label: '框架合同' },
  { value: 'ANNUAL_PRICE', label: '年度价格协议' },
]

export function customerStatusLabel(value) {
  return CUSTOMER_STATUS[value]?.label || value || '—'
}

export function contractStatusLabel(value) {
  return CONTRACT_STATUS[value]?.label || value || '—'
}

export function sourceLabel(value) {
  return CUSTOMER_SOURCE_OPTIONS.find((item) => item.value === value)?.label || value || '—'
}

/** 应收状态，与后端 biz_receivable.status 保持一致；逾期是实时计算，不是状态。 */
export const RECEIVABLE_STATUS = {
  UNPAID: { label: '未收款', type: 'warning' },
  PARTIAL: { label: '部分收款', type: 'primary' },
  PAID: { label: '已收清', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

/** 应收筛选项：OPEN=未结清、OVERDUE=已逾期，其余为真实状态。 */
export const RECEIVABLE_STATUS_OPTIONS = [
  { value: 'OPEN', label: '未结清' },
  { value: 'OVERDUE', label: '已逾期' },
  { value: 'UNPAID', label: '未收款' },
  { value: 'PARTIAL', label: '部分收款' },
  { value: 'PAID', label: '已收清' },
  { value: 'CANCELLED', label: '已取消' },
]

/** 收款单状态，与后端 biz_receipt.status 保持一致。 */
export const RECEIPT_STATUS = {
  UNALLOCATED: { label: '待核销', type: 'warning' },
  PARTIAL: { label: '部分核销', type: 'primary' },
  ALLOCATED: { label: '已核销', type: 'success' },
  CANCELLED: { label: '已作废', type: 'info' },
}

export const RECEIPT_STATUS_OPTIONS = Object.entries(RECEIPT_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/** 收款方式；只做内部登记，不对接银行或第三方支付。 */
export const RECEIPT_METHOD_OPTIONS = [
  { value: 'BANK_TRANSFER', label: '银行转账' },
  { value: 'ACCEPTANCE', label: '银行承兑' },
  { value: 'CASH', label: '现金' },
  { value: 'OTHER', label: '其他' },
]

export function receivableStatusLabel(value) {
  return RECEIVABLE_STATUS[value]?.label || value || '—'
}

export function receiptStatusLabel(value) {
  return RECEIPT_STATUS[value]?.label || value || '—'
}

export function receiptMethodLabel(value) {
  return RECEIPT_METHOD_OPTIONS.find((item) => item.value === value)?.label || value || '—'
}

/** 发票类型；只做内部登记，不对接税控或电子发票平台。 */
export const INVOICE_TYPE_OPTIONS = [
  { value: 'VAT_SPECIAL', label: '增值税专用发票' },
  { value: 'VAT_NORMAL', label: '增值税普通发票' },
  { value: 'ELECTRONIC', label: '电子发票' },
  { value: 'OTHER', label: '其他' },
]

/** 发票状态：已登记、已寄出、客户签收；作废/红冲待审批中心上线后开放。 */
export const INVOICE_STATUS = {
  REGISTERED: { label: '已登记', type: 'warning' },
  SENT: { label: '已寄出', type: 'primary' },
  SIGNED: { label: '客户签收', type: 'success' },
  VOID: { label: '已作废', type: 'info' },
  REVERSED: { label: '已红冲', type: 'danger' },
}

export const INVOICE_STATUS_OPTIONS = Object.entries(INVOICE_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

export function invoiceStatusLabel(value) {
  return INVOICE_STATUS[value]?.label || value || '—'
}

export function invoiceTypeLabel(value) {
  return INVOICE_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '—'
}

/** 对账单状态：生成后客户确认归档，确认后不再修改金额。 */
export const STATEMENT_STATUS = {
  GENERATED: { label: '已生成', type: 'warning' },
  CONFIRMED: { label: '客户已确认', type: 'success' },
  CANCELLED: { label: '已取消', type: 'info' },
}

export const STATEMENT_STATUS_OPTIONS = Object.entries(STATEMENT_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

export function statementStatusLabel(value) {
  return STATEMENT_STATUS[value]?.label || value || '—'
}

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS).map(([value, item]) => ({
  value,
  label: item.label,
}))

/**
 * 尚未落地的业务模块。前端保留入口和范围说明，避免出现“点了没反应”的空菜单。
 * 后端模块完成后，把对应路由替换成真实页面即可。
 */
export const ROADMAP_MODULES = {
  finance: {
    key: 'finance',
    code: 'FIN',
    name: '财务管理',
    state: 'partial',
    icon: 'WalletFilled',
    color: '#d97706',
    priority: 'P0',
    summary: '应收、信用、逾期、合同、开票、对账与资金流水。合同录入、信用看板、应收、收款核销、手工开票和客户对账单已上线。',
    status: '合同/信用/应收/收款/开票/对账已完成，报销与资金规划中',
    features: [
      '信用额度与调整记录，已用额度 = 未收应收 + 已确认未发货订单',
      '应收账龄与逾期超过 30 天阻断下单/发货',
      '收款登记与核销、手工开票登记与状态推进、客户对账单生成与确认已实现',
      '应付与付款、费用报销、借款/还款单据待实现',
    ],
    rules: [
      '所有金额以分存储，计算时直接截断，不四舍五入',
      '无期初库存、期初应收、期初应付，从零开始',
      '审批档位由财务在上线前配置',
    ],
  },
  warehouse: {
    key: 'warehouse',
    code: 'WH',
    name: '仓储管理',
    state: 'partial',
    icon: 'Box',
    color: '#0f766e',
    priority: 'P0',
    summary: '仓库档案、物料档案、库存台账、采购入库、跨厂调拨与工单领料已上线；成本结转待实现。',
    status: '仓库、采购入库与领料已完成，成本结转待实现',
    features: [
      '每个工厂至少一个主仓，仓库不跨厂',
      '采购入库是库存增加与材料成本的唯一来源',
      '跨厂调拨先出库后入库，库存数量不允许为负',
      '物料单价 4 位小数、损耗率 2 位小数，数量 2 位小数并截断',
      '工单领料已上线并计入工单材料成本，订单成本结转与仓储审批待实现',
    ],
    rules: [
      '没有期初库存，库存只由采购入库和调拨入库产生',
      '入库单确认收货后不可修改，作废与红冲需走审批',
    ],
  },
  equipment: {
    key: 'equipment',
    code: 'EQ',
    name: '设备上报与维保',
    state: 'partial',
    icon: 'Cpu',
    color: '#7c3aed',
    priority: 'P0',
    summary: '设备台账、厂内排产、设备队列、维护工单与点检保养已上线；IoT 上报规划中。',
    status: '设备台账、FIFO 队列与维保记录已完成，IoT 上报规划中',
    features: [
      '设备台账、能力参数、操作员要求与状态已上线',
      '每台设备同一时间只执行一个订单，超出产能按 FIFO 排队',
      '订单只能在单工厂内拆分到不同设备，插队由销售申请、厂长审批',
      '维护工单与点检保养记录已上线，停机期间队列保留并通知交期风险',
      'MQTT/CoAP 设备上报与 IoTDB 故障数据待实现',
    ],
    rules: [
      '设备维护费用全部由公司承担',
      '不做设备使用费，不接入第三方设备平台',
      '设备上报数据分为订单作业数据与自检/故障数据',
    ],
  },
  approvals: {
    key: 'approvals',
    code: 'APR',
    name: '审批中心',
    state: 'partial',
    icon: 'Stamp',
    color: '#e11d48',
    priority: 'P0',
    summary: '审批定义、申请、待办与轨迹已上线；已打通客户信用额度调整落地。',
    status: '审批中心已上线，更多业务待接入',
    features: [
      '我的待办、我的申请、审批流程与金额档位配置',
      '同意、驳回、撤销，审批轨迹只追加不修改',
      '审批通过后由业务动作执行器回调业务服务落地变更',
      '插队审批仍使用过渡端点，后续迁入统一待办',
    ],
    rules: [
      '金额档位按“下限含、上限不含”匹配，优先级数字小的先命中',
      '业务动作先执行、结论后落库，失败整体回滚',
      '审批节点保留组织快照，避免人员调岗后历史失真',
      '插队无冻结窗口，审批通过后立即生效',
    ],
  },
  reports: {
    key: 'reports',
    code: 'RPT',
    name: '报表中心',
    state: 'partial',
    icon: 'DataAnalysis',
    color: '#475569',
    priority: 'P1',
    summary: '首页工作台与经营大屏已上线（platform-bi 只读聚合 + bi_metric 指标语义层），订单、生产、设备、库存、采购、财务与业务员报表的分主题报表待实现。',
    status: '首页大屏/经营驾驶舱已完成，导出任务与分主题报表规划中',
    features: [
      '本月订单额/订单数、订单完成率、未关闭订单',
      '本月收款、应收余额、逾期应收、信用超限客户',
      '待付款报销、借款未还、待审批数量与平均审批时长',
      '设备故障数、队列平均等待、库存金额、缺料预警项',
      '导出任务与权限控制',
    ],
    rules: [
      '报表数据范围跟随角色（管理员/财务全公司、厂长本厂、销售本人）',
      '成本/毛利字段按字段权限显示（bi:cost:read）',
      '未接入数据源的指标只标记“待数据源”，不用零值或估算值代替',
    ],
  },
}
