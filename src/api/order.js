import http from './http'

/**
 * 分页查询订单。
 * @param {{page?: number, size?: number, orderNo?: string, customerId?: string,
 *          factoryId?: string, orderStatus?: string}} params
 */
export function fetchOrderPage(params = {}) {
  return http.get('/order/orders/page', { params }).then((body) => body.data)
}

/** 按订单号查询详情。订单号是分片键，后端会精确路由。 */
export function fetchOrder(orderNo) {
  return http.get(`/order/orders/${encodeURIComponent(orderNo)}`).then((body) => body.data)
}

/**
 * 查询某客户的未关闭订单占用，用于财务信用看板。
 * 仅拥有 finance:credit:read 权限的角色可调用。
 */
export function fetchCreditOccupancy(customerId) {
  return http
    .get('/order/orders/occupancy', { params: { customerId } })
    .then((body) => body.data)
}

/**
 * 创建订单。
 * @param {{customerId: string, contractId: string, factoryId: string,
 *          totalAmount: string, currency: string, remark?: string}} payload
 */
export function createOrder(payload) {
  return http.post('/order/orders', payload).then((body) => body.data)
}
