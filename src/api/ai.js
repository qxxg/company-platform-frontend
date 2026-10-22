import http from './http'

/**
 * AI 助手接口。
 *
 * 本地 4B 模型在 CPU 上推理可能需要几十秒，因此单次对话单独放大 Axios 超时；
 * 普通列表接口仍使用全局 15 秒超时，避免模型故障拖住整个页面。
 */

/** 发送一轮对话。 */
export function chatWithAssistant(payload) {
  return http
    .post('/ai/chat', payload, { timeout: 300000 })
    .then((body) => body.data)
}

/** 查询当前模型配置，用于页面展示。 */
export function fetchAssistantStatus() {
  return http.get('/ai/status').then((body) => body.data)
}
