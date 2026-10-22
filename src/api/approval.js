import http from './http'

/**
 * 流程审批中心接口。
 *
 * 审批中心负责流程与结论：提交申请按“业务类型 + 金额档位”匹配审批流程，审批人
 * 在待办中同意或驳回；同意时由审批中心回调业务服务落地实际变更（例如客户信用
 * 额度调整）。金额一律以分存储。
 */

/** 提交审批申请。 */
export function submitApproval(payload) {
  return http.post('/approval/instances', payload).then((body) => body.data)
}

/** 审批单分页；mine=true 只看本人提交的申请。 */
export function fetchApprovalPage(params = {}) {
  return http.get('/approval/instances/page', { params }).then((body) => body.data)
}

/** 我的待办分页。 */
export function fetchApprovalTodoPage(params = {}) {
  return http.get('/approval/todos/page', { params }).then((body) => body.data)
}

/** 审批单详情（含任务与轨迹）。 */
export function fetchApproval(id) {
  return http.get(`/approval/instances/${encodeURIComponent(id)}`).then((body) => body.data)
}

/** 审批同意。 */
export function approveTask(taskId, comment) {
  return http.post(`/approval/tasks/${encodeURIComponent(taskId)}/approve`, { comment }).then((body) => body.data)
}

/** 审批驳回。 */
export function rejectTask(taskId, comment) {
  return http.post(`/approval/tasks/${encodeURIComponent(taskId)}/reject`, { comment }).then((body) => body.data)
}

/** 撤销待审批申请。 */
export function cancelApproval(id) {
  return http.post(`/approval/instances/${encodeURIComponent(id)}/cancel`).then((body) => body.data)
}

/** 审批定义（金额档位）分页。 */
export function fetchApprovalDefinitionPage(params = {}) {
  return http.get('/approval/definitions/page', { params }).then((body) => body.data)
}

/** 新建审批定义。 */
export function createApprovalDefinition(payload) {
  return http.post('/approval/definitions', payload).then((body) => body.data)
}

/** 修改审批定义。 */
export function updateApprovalDefinition(id, payload) {
  return http.put(`/approval/definitions/${encodeURIComponent(id)}`, payload).then((body) => body.data)
}

/** 启用/停用审批定义。 */
export function changeApprovalDefinitionStatus(id, status) {
  return http
    .post(`/approval/definitions/${encodeURIComponent(id)}/status`, null, { params: { status } })
    .then((body) => body.data)
}
