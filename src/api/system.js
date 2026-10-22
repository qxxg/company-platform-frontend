import http from './http'

/** 当前令牌对应的用户信息与权限。 */
export function fetchMe() {
  return http.get('/system/me').then((body) => body.data)
}

/** 用户列表（需要 system:user:list）。 */
export function fetchUsers() {
  return http.get('/system/users').then((body) => body.data)
}

/** 工厂列表（需要 system:factory:list）。 */
export function fetchFactories() {
  return http.get('/system/factories').then((body) => body.data)
}
