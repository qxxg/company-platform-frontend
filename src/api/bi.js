import http from './http'

/**
 * 首页大屏 / BI 接口。
 *
 * 所有金额仍是后端格式化的展示文本；前端只负责布局和图表。数据范围与指标
 * 可见性由 BI 服务按 JWT 计算，前端隐藏卡片不能替代后端权限。
 */

/** 获取当前用户可见的工作台/大屏数据。 */
export function fetchBiDashboard() {
  return http.get('/bi/dashboard', { timeout: 30000 }).then((body) => body.data)
}

/** 获取指标口径。 */
export function fetchBiMetrics() {
  return http.get('/bi/metrics', { timeout: 30000 }).then((body) => body.data)
}

/** 管理员手动触发 ETL；按钮只对有 bi:etl:run 的角色展示。 */
export function triggerBiRefresh() {
  return http.post('/bi/admin/refresh', null, { timeout: 120000 }).then((body) => body.data)
}
