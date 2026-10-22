/**
 * 统一的前端业务异常。
 *
 * 后端 ApiResponse 的 code 为业务码（0 表示成功），HTTP 状态码同时保留。
 * 页面可以通过 traceId 把问题快速定位到服务端日志。
 */
export class ApiError extends Error {
  constructor(message, code = 0, traceId = '', data = null) {
    super(message || '请求失败')
    this.name = 'ApiError'
    this.code = code
    this.traceId = traceId
    this.data = data
  }
}

export function errorMessage(error, fallback = '操作失败，请稍后重试') {
  if (!error) return fallback
  if (error instanceof ApiError) return error.message || fallback
  if (typeof error === 'string') return error
  return error.message || fallback
}

export function errorWithTrace(error) {
  if (error?.traceId) {
    return `${errorMessage(error)}（追踪号：${error.traceId}）`
  }
  return errorMessage(error)
}
