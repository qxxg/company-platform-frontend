import http from './http'

/**
 * 分页查询客户。
 * @param {{page?: number, size?: number, keyword?: string, status?: string, ownerUserId?: string}} params
 */
export function fetchCustomerPage(params = {}) {
  return http.get('/customer/customers/page', { params }).then((body) => body.data)
}

/** 按 ID 查询客户详情。 */
export function fetchCustomer(id) {
  return http.get(`/customer/customers/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建客户。 */
export function createCustomer(payload) {
  return http.post('/customer/customers', payload).then((body) => body.data)
}

/** 修改客户非审批字段。 */
export function updateCustomer(id, payload) {
  return http.put(`/customer/customers/${encodeURIComponent(id)}`, payload).then((body) => body.data)
}

/** 客户应收侧信用信息；订单占用需要再调用订单接口。 */
export function fetchCustomerCredit(id) {
  return http.get(`/customer/customers/${encodeURIComponent(id)}/credit`).then((body) => body.data)
}

/** 某客户当前可用于下单的合同。 */
export function fetchAvailableContracts(customerId) {
  return http
    .get('/customer/contracts/available', { params: { customerId } })
    .then((body) => body.data)
}

/**
 * 财务合同分页查询。
 * @param {{page?: number, size?: number, keyword?: string, customerId?: string,
 *          status?: string}} params
 */
export function fetchContractPage(params = {}) {
  return http.get('/customer/contracts/page', { params }).then((body) => body.data)
}

/** 财务新建合同，初始状态为待录入。 */
export function createContract(payload) {
  return http.post('/customer/contracts', payload).then((body) => body.data)
}

/** 财务正式录入合同。 */
export function enterContract(id) {
  return http.post(`/customer/contracts/${encodeURIComponent(id)}/enter`).then((body) => body.data)
}

/** 合同详情。 */
export function fetchContract(id) {
  return http.get(`/customer/contracts/${encodeURIComponent(id)}`).then((body) => body.data)
}
