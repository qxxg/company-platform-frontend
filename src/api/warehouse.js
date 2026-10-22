import http from './http'

/**
 * 仓储系统接口：仓库档案、物料档案、库存台账、采购入库与跨厂调拨。
 *
 * 路径都经网关 `/api/order/**` 转发到 platform-order。金额一律以分存储（后端
 * 字段名以 Amount 结尾），数量保留 2 位小数，单价保留 4 位小数；页面只展示后端
 * 返回的结果，不在前端推导库存或成本规则。
 */

/** 仓库分页。 */
export function fetchWarehousePage(params = {}) {
  return http.get('/order/warehouses/page', { params }).then((body) => body.data)
}

/** 仓库下拉选项。 */
export function fetchWarehouseOptions(factoryId) {
  return http
    .get('/order/warehouses/options', { params: factoryId ? { factoryId } : {} })
    .then((body) => body.data)
}

/** 仓库详情。 */
export function fetchWarehouse(id) {
  return http.get(`/order/warehouses/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建仓库。 */
export function createWarehouse(payload) {
  return http.post('/order/warehouses', payload).then((body) => body.data)
}

/** 修改仓库。 */
export function updateWarehouse(id, payload) {
  return http.put(`/order/warehouses/${encodeURIComponent(id)}`, payload).then((body) => body.data)
}

/** 启用/停用仓库。 */
export function changeWarehouseStatus(id, status) {
  return http
    .post(`/order/warehouses/${encodeURIComponent(id)}/status`, null, { params: { status } })
    .then((body) => body.data)
}

/** 物料分页。 */
export function fetchMaterialPage(params = {}) {
  return http.get('/order/materials/page', { params }).then((body) => body.data)
}

/** 物料下拉选项（只含启用物料）。 */
export function fetchMaterialOptions() {
  return http.get('/order/materials/options').then((body) => body.data)
}

/** 新建物料。 */
export function createMaterial(payload) {
  return http.post('/order/materials', payload).then((body) => body.data)
}

/** 修改物料。 */
export function updateMaterial(id, payload) {
  return http.put(`/order/materials/${encodeURIComponent(id)}`, payload).then((body) => body.data)
}

/** 启用/停用物料。 */
export function changeMaterialStatus(id, status) {
  return http
    .post(`/order/materials/${encodeURIComponent(id)}/status`, null, { params: { status } })
    .then((body) => body.data)
}

/** 库存台账分页。 */
export function fetchInventoryPage(params = {}) {
  return http.get('/order/inventories/page', { params }).then((body) => body.data)
}

/** 采购入库单分页。 */
export function fetchPurchaseReceiptPage(params = {}) {
  return http.get('/order/purchase-receipts/page', { params }).then((body) => body.data)
}

/** 采购入库单详情。 */
export function fetchPurchaseReceipt(id) {
  return http.get(`/order/purchase-receipts/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建采购入库单（草稿）。 */
export function createPurchaseReceipt(payload) {
  return http.post('/order/purchase-receipts', payload).then((body) => body.data)
}

/** 确认收货：增加库存。 */
export function receivePurchaseReceipt(id) {
  return http.post(`/order/purchase-receipts/${encodeURIComponent(id)}/receive`).then((body) => body.data)
}

/** 取消草稿入库单。 */
export function cancelPurchaseReceipt(id) {
  return http.post(`/order/purchase-receipts/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 跨厂调拨单分页。 */
export function fetchStockTransferPage(params = {}) {
  return http.get('/order/stock-transfers/page', { params }).then((body) => body.data)
}

/** 跨厂调拨单详情。 */
export function fetchStockTransfer(id) {
  return http.get(`/order/stock-transfers/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建调拨单（待出库）。 */
export function createStockTransfer(payload) {
  return http.post('/order/stock-transfers', payload).then((body) => body.data)
}

/** 调拨出库：扣减调出仓库库存。 */
export function shipStockTransfer(id) {
  return http.post(`/order/stock-transfers/${encodeURIComponent(id)}/ship`).then((body) => body.data)
}

/** 调拨入库：增加调入仓库库存。 */
export function receiveStockTransfer(id) {
  return http.post(`/order/stock-transfers/${encodeURIComponent(id)}/receive`).then((body) => body.data)
}

/** 取消待出库调拨单。 */
export function cancelStockTransfer(id) {
  return http.post(`/order/stock-transfers/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 工单领料单分页。 */
export function fetchMaterialIssuePage(params = {}) {
  return http.get('/order/material-issues/page', { params }).then((body) => body.data)
}

/** 工单领料单详情。 */
export function fetchMaterialIssue(id) {
  return http.get(`/order/material-issues/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 为工单新建领料单（待发料）。 */
export function createMaterialIssue(workOrderId, payload) {
  return http
    .post(`/order/work-orders/${encodeURIComponent(workOrderId)}/issues`, payload)
    .then((body) => body.data)
}

/** 确认发料：扣减库存并计入工单材料成本。 */
export function issueMaterial(id) {
  return http.post(`/order/material-issues/${encodeURIComponent(id)}/issue`).then((body) => body.data)
}

/** 取消待发料的领料单。 */
export function cancelMaterialIssue(id) {
  return http.post(`/order/material-issues/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}
