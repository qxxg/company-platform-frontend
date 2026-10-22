import http from './http'

/**
 * 站内消息接口。
 *
 * 消息只属于当前登录用户，前端不传用户 ID；未读数量用于顶部铃铛角标。
 */

/** 当前用户未读消息数。 */
export function fetchUnreadCount() {
  return http.get('/order/messages/unread-count').then((body) => body.data.unreadCount)
}

/** 当前用户消息分页。 */
export function fetchMessagePage(params = {}) {
  return http.get('/order/messages/page', { params }).then((body) => body.data)
}

/** 标记一条消息已读。 */
export function markMessageRead(id) {
  return http.post(`/order/messages/${encodeURIComponent(id)}/read`).then((body) => body.data)
}

/** 全部标记已读，返回更新条数。 */
export function markAllMessagesRead() {
  return http.post('/order/messages/read-all').then((body) => body.data.updated)
}
