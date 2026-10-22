import http from './http'

/**
 * 设备台账与生产排产接口。
 *
 * 所有路径都经网关 `/api/order/**` 转发到 platform-order；金额无关，长度单位为
 * 米/毫米，队列位置从 1 开始。页面只展示后端返回的状态和计划时间，不在前端
 * 推导排产规则。
 */

/** 设备台账分页（equipment:read）。 */
export function fetchDevicePage(params = {}) {
  return http.get('/order/devices/page', { params }).then((body) => body.data)
}

/** 设备下拉选项；排产页面也可调用。 */
export function fetchDeviceOptions(factoryId) {
  return http
    .get('/order/devices/options', { params: factoryId ? { factoryId } : {} })
    .then((body) => body.data)
}

/** 设备详情。 */
export function fetchDevice(id) {
  return http.get(`/order/devices/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 新建设备。 */
export function createDevice(payload) {
  return http.post('/order/devices', payload).then((body) => body.data)
}

/** 修改设备能力和位置。 */
export function updateDevice(id, payload) {
  return http.put(`/order/devices/${encodeURIComponent(id)}`, payload).then((body) => body.data)
}

/** 人工变更设备状态（空闲/保养/故障/停用）。 */
export function changeDeviceStatus(id, payload) {
  return http.post(`/order/devices/${encodeURIComponent(id)}/status`, payload).then((body) => body.data)
}

/** 工单分页。 */
export function fetchWorkOrderPage(params = {}) {
  return http.get('/order/work-orders/page', { params }).then((body) => body.data)
}

/** 工单详情。 */
export function fetchWorkOrder(id) {
  return http.get(`/order/work-orders/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 某订单的全部工单，订单详情页使用。 */
export function fetchWorkOrdersByOrder(orderNo) {
  return http
    .get(`/order/work-orders/by-order/${encodeURIComponent(orderNo)}`)
    .then((body) => body.data)
}

/** 创建工单；deviceId 可为空，先进入待排产。 */
export function createWorkOrder(payload) {
  return http.post('/order/work-orders', payload).then((body) => body.data)
}

/** 给待排产工单分配同工厂设备。 */
export function assignWorkOrder(id, deviceId) {
  return http
    .post(`/order/work-orders/${encodeURIComponent(id)}/assign`, { deviceId })
    .then((body) => body.data)
}

/** 开始队首工单。 */
export function startWorkOrder(id) {
  return http.post(`/order/work-orders/${encodeURIComponent(id)}/start`).then((body) => body.data)
}

/** 完成生产中工单。 */
export function completeWorkOrder(id) {
  return http.post(`/order/work-orders/${encodeURIComponent(id)}/complete`).then((body) => body.data)
}

/** 取消待排产或排队中工单。 */
export function cancelWorkOrder(id) {
  return http.post(`/order/work-orders/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 设备队列看板，按设备分组。 */
export function fetchProductionBoard(factoryId) {
  return http
    .get('/order/production/board', { params: factoryId ? { factoryId } : {} })
    .then((body) => body.data)
}

/** 插队申请分页。 */
export function fetchJumpRequestPage(params = {}) {
  return http.get('/order/jump-requests/page', { params }).then((body) => body.data)
}

/** 对排队中工单发起插队申请；申请会同步提交审批中心，由厂长在待办中审批。 */
export function createJumpRequest(workOrderId, payload) {
  return http
    .post(`/order/work-orders/${encodeURIComponent(workOrderId)}/jump-requests`, payload)
    .then((body) => body.data)
}

/** 维护工单分页（equipment:maintenance:read）。 */
export function fetchMaintenanceOrderPage(params = {}) {
  return http.get('/order/maintenance-orders/page', { params }).then((body) => body.data)
}

/** 维护工单详情。 */
export function fetchMaintenanceOrder(id) {
  return http.get(`/order/maintenance-orders/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 某台设备的维护工单。 */
export function fetchDeviceMaintenanceOrders(deviceId) {
  return http
    .get(`/order/maintenance-orders/by-device/${encodeURIComponent(deviceId)}`)
    .then((body) => body.data)
}

/** 新建维护工单。 */
export function createMaintenanceOrder(payload) {
  return http.post('/order/maintenance-orders', payload).then((body) => body.data)
}

/** 开始维护：设备转为保养或故障状态，等待队列保留。 */
export function startMaintenanceOrder(id) {
  return http.post(`/order/maintenance-orders/${encodeURIComponent(id)}/start`).then((body) => body.data)
}

/** 完成维护：登记成本与停机时长，设备恢复空闲。 */
export function completeMaintenanceOrder(id, payload) {
  return http.post(`/order/maintenance-orders/${encodeURIComponent(id)}/complete`, payload).then((body) => body.data)
}

/** 取消待处理的维护工单。 */
export function cancelMaintenanceOrder(id) {
  return http.post(`/order/maintenance-orders/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 点检记录分页（equipment:inspection:read）。 */
export function fetchInspectionPage(params = {}) {
  return http.get('/order/inspections/page', { params }).then((body) => body.data)
}

/** 登记点检记录。 */
export function createInspection(payload) {
  return http.post('/order/inspections', payload).then((body) => body.data)
}

/** 由异常点检生成维护工单。 */
export function createMaintenanceFromInspection(id) {
  return http
    .post(`/order/inspections/${encodeURIComponent(id)}/maintenance-order`)
    .then((body) => body.data)
}

/** 设备上报：订单作业数据分页（按订单号覆盖）。 */
export function fetchDeviceOrderReports(params = {}) {
  return http.get('/order/device-reports/page', { params }).then((body) => body.data)
}

/** 设备上报：订单图片记录分页。 */
export function fetchDeviceImages(params = {}) {
  return http.get('/order/device-reports/images/page', { params }).then((body) => body.data)
}

/** 设备上报：未匹配暂存分页。 */
export function fetchDeviceReportStaging(params = {}) {
  return http.get('/order/device-reports/staging/page', { params }).then((body) => body.data)
}

/** 设备上报：接入审计分页。 */
export function fetchDeviceAccessLogs(params = {}) {
  return http.get('/order/device-reports/logs/page', { params }).then((body) => body.data)
}

/** 设备上报：接入凭据分页（密钥掩码）。 */
export function fetchDeviceCredentials(params = {}) {
  return http.get('/order/device-reports/credentials/page', { params }).then((body) => body.data)
}

/** 设备上报：IoTDB 时序数据查询。 */
export function fetchDeviceTimeSeries(deviceNo, measurement, limit = 20) {
  return http
    .get(`/order/device-reports/iotdb/${encodeURIComponent(deviceNo)}`, {
      params: { measurement, limit },
    })
    .then((body) => body.data)
}

/** 设备上报：接入配置概览。 */
export function fetchDeviceReportConfig() {
  return http.get('/order/device-reports/config').then((body) => body.data)
}
