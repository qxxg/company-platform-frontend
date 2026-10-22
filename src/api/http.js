import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/utils/errors'

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '')
  return `${Date.now()}${Math.random().toString(16).slice(2)}`
}

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`
  }
  config.headers['X-Request-Id'] = requestId()
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data
    // 后端统一返回 ApiResponse；code !== 0 时仍按业务失败处理。
    if (body && typeof body === 'object' && 'code' in body && body.code !== 0) {
      return Promise.reject(new ApiError(body.message, body.code, body.traceId, body.data))
    }
    return body
  },
  (error) => {
    const status = error.response?.status
    const body = error.response?.data
    const traceId = body?.traceId || error.response?.headers?.['x-request-id'] || ''

    if (status === 401) {
      const auth = useAuthStore()
      auth.clearSession()
      if (!window.location.pathname.startsWith('/login')) {
        const redirect = `${window.location.pathname}${window.location.search}`
        window.location.replace(`/login?reason=expired&redirect=${encodeURIComponent(redirect)}`)
      }
    }

    // 网络中断、Vite 代理 500 或网关不可用时，Axios 自带的
    // “Request failed with status code 500”对业务用户没有意义，统一换成可操作提示。
    let fallback = error.message || '网络请求失败，请检查服务是否已启动'
    if (!error.response) {
      fallback = '无法连接服务器，请检查网关与后端服务是否已启动'
    } else if (status >= 500) {
      fallback = '服务暂不可用，请检查网关与后端服务'
    } else if (status === 404) {
      fallback = '请求的资源不存在'
    }

    return Promise.reject(
      new ApiError(
        body?.message || fallback,
        body?.code ?? status ?? 0,
        traceId,
        body?.data ?? null,
      ),
    )
  },
)

export default http
