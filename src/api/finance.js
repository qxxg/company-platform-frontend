import http from './http'

/**
 * 财务应收/收款接口客户端。
 *
 * 所有金额都是“分”的字符串，页面只负责展示和输入转换，不做金额计算。
 * 路径统一走网关的 /api/finance/** 路由，后端当前由客户服务托管。
 */

/**
 * 应收分页查询。
 * @param {{page?: number, size?: number, keyword?: string, customerId?: string,
 *          status?: string, dueFrom?: string, dueTo?: string}} params
 */
export function fetchReceivablePage(params = {}) {
  return http.get('/finance/receivables/page', { params }).then((body) => body.data)
}

/** 应收详情。 */
export function fetchReceivable(id) {
  return http.get(`/finance/receivables/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 某客户未结清应收，供收款核销弹窗选择。 */
export function fetchOpenReceivables(customerId) {
  return http
    .get('/finance/receivables/open', { params: { customerId } })
    .then((body) => body.data)
}

/** 财务手工补录应收。 */
export function createReceivable(payload) {
  return http.post('/finance/receivables', payload).then((body) => body.data)
}

/**
 * 收款单分页查询。
 * @param {{page?: number, size?: number, keyword?: string, customerId?: string,
 *          status?: string, dateFrom?: string, dateTo?: string}} params
 */
export function fetchReceiptPage(params = {}) {
  return http.get('/finance/receipts/page', { params }).then((body) => body.data)
}

/** 收款详情，包含核销明细。 */
export function fetchReceipt(id) {
  return http.get(`/finance/receipts/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 登记收款单。 */
export function createReceipt(payload) {
  return http.post('/finance/receipts', payload).then((body) => body.data)
}

/**
 * 核销收款单到一张或多张应收。
 * @param {string|number} id 收款单 ID
 * @param {{allocations: Array<{receivableId: string|number, amount: string|number}>}} payload
 */
export function allocateReceipt(id, payload) {
  return http
    .post(`/finance/receipts/${encodeURIComponent(id)}/allocations`, payload)
    .then((body) => body.data)
}

/**
 * 手工发票分页查询。
 * @param {{page?: number, size?: number, keyword?: string, customerId?: string,
 *          status?: string, dateFrom?: string, dateTo?: string}} params
 */
export function fetchInvoicePage(params = {}) {
  return http.get('/finance/invoices/page', { params }).then((body) => body.data)
}

/** 发票详情。 */
export function fetchInvoice(id) {
  return http.get(`/finance/invoices/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 登记手工发票。 */
export function createInvoice(payload) {
  return http.post('/finance/invoices', payload).then((body) => body.data)
}

/** 标记发票已寄出。 */
export function sendInvoice(id) {
  return http.post(`/finance/invoices/${encodeURIComponent(id)}/send`).then((body) => body.data)
}

/** 标记发票客户已签收。 */
export function signInvoice(id) {
  return http.post(`/finance/invoices/${encodeURIComponent(id)}/sign`).then((body) => body.data)
}

/**
 * 客户对账单分页查询。
 * @param {{page?: number, size?: number, keyword?: string, customerId?: string,
 *          status?: string, periodFrom?: string, periodTo?: string}} params
 */
export function fetchStatementPage(params = {}) {
  return http.get('/finance/statements/page', { params }).then((body) => body.data)
}

/** 对账单详情，含快照明细。 */
export function fetchStatement(id) {
  return http.get(`/finance/statements/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 生成客户对账单。 */
export function generateStatement(payload) {
  return http.post('/finance/statements', payload).then((body) => body.data)
}

/** 客户确认对账单。 */
export function confirmStatement(id, payload = {}) {
  return http
    .post(`/finance/statements/${encodeURIComponent(id)}/confirm`, payload)
    .then((body) => body.data)
}

/**
 * 费用报销分页查询。
 * @param {{page?: number, size?: number, keyword?: string, status?: string,
 *          expenseType?: string, dateFrom?: string, dateTo?: string}} params
 */
export function fetchExpensePage(params = {}) {
  return http.get('/finance/expenses/page', { params }).then((body) => body.data)
}

/** 报销单详情。 */
export function fetchExpense(id) {
  return http.get(`/finance/expenses/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建报销草稿。 */
export function createExpense(payload) {
  return http.post('/finance/expenses', payload).then((body) => body.data)
}

/** 提交报销审批。 */
export function submitExpense(id) {
  return http.post(`/finance/expenses/${encodeURIComponent(id)}/submit`).then((body) => body.data)
}

/** 取消草稿或撤销审批中的报销单。 */
export function cancelExpense(id) {
  return http.post(`/finance/expenses/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 财务登记报销付款；可同时用未还借款冲销。 */
export function payExpense(id, payload) {
  return http.post(`/finance/expenses/${encodeURIComponent(id)}/pay`, payload).then((body) => body.data)
}

/** 报销人的未还借款，供付款冲销选择。 */
export function fetchOutstandingLoans(claimId) {
  return http
    .get(`/finance/expenses/${encodeURIComponent(claimId)}/outstanding-loans`)
    .then((body) => body.data)
}

/**
 * 借款单分页查询。
 * @param {{page?: number, size?: number, keyword?: string, status?: string,
 *          dateFrom?: string, dateTo?: string}} params
 */
export function fetchLoanPage(params = {}) {
  return http.get('/finance/loans/page', { params }).then((body) => body.data)
}

/** 借款单详情，含还款记录。 */
export function fetchLoan(id) {
  return http.get(`/finance/loans/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建借款草稿。 */
export function createLoan(payload) {
  return http.post('/finance/loans', payload).then((body) => body.data)
}

/** 提交借款审批。 */
export function submitLoan(id) {
  return http.post(`/finance/loans/${encodeURIComponent(id)}/submit`).then((body) => body.data)
}

/** 取消草稿或撤销审批中的借款单。 */
export function cancelLoan(id) {
  return http.post(`/finance/loans/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 财务登记放款。 */
export function disburseLoan(id, payload = {}) {
  return http.post(`/finance/loans/${encodeURIComponent(id)}/disburse`, payload).then((body) => body.data)
}

/** 财务登记手工还款。 */
export function repayLoan(id, payload) {
  return http.post(`/finance/loans/${encodeURIComponent(id)}/repay`, payload).then((body) => body.data)
}
