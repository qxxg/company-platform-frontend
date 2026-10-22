import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { decodeJwt, getTokenExpiresAt, isTokenExpired } from '@/utils/jwt'
import {
  beginLogin,
  clearOAuthState,
  exchangeAuthorizationCode,
  readOAuthState,
} from '@/utils/oauth'

const STORAGE_KEY = 'company.platform.auth.session'

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw)
    if (!value?.accessToken) return null
    if (isTokenExpired(value.accessToken, 0)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return value
  } catch {
    return null
  }
}

function persistSession(value) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // 浏览器禁用本地存储时仍允许当前内存会话工作。
  }
}

/**
 * 认证状态 Store。
 *
 * 令牌保存在 localStorage，刷新页面后可继续使用；由于公开客户端默认不签发
 * refresh_token，access_token 到期后需要重新走一次 OAuth2 登录。生产环境若
 * 需要“无感续期”，应改由后端 BFF 使用 HttpOnly Cookie 承载会话。
 */
export const useAuthStore = defineStore('auth', () => {
  const session = ref(readStoredSession())

  const accessToken = computed(() => session.value?.accessToken || '')
  const idToken = computed(() => session.value?.idToken || '')
  const claims = computed(() => decodeJwt(accessToken.value))
  const isAuthenticated = computed(() => Boolean(accessToken.value) && !isTokenExpired(accessToken.value))
  const userId = computed(() => claims.value?.user_id ?? '')
  const username = computed(() => claims.value?.username || '')
  const nickname = computed(() => claims.value?.nickname || '')
  const employeeNo = computed(() => claims.value?.employee_no || '')
  const factoryId = computed(() => claims.value?.factory_id ?? '')
  const roles = computed(() => {
    const value = claims.value?.roles
    return Array.isArray(value) ? value : []
  })
  const permissions = computed(() => {
    const value = claims.value?.permissions
    return Array.isArray(value) ? value : []
  })
  const permissionSet = computed(() => new Set(permissions.value))
  const displayName = computed(() => nickname.value || username.value || '未登录用户')
  const tokenExpiresAt = computed(() => session.value?.expiresAt || getTokenExpiresAt(accessToken.value))

  function setSession(tokenResponse) {
    if (!tokenResponse?.access_token) {
      throw new Error('认证中心未返回 access_token')
    }
    const expiresAt = tokenResponse.expires_in
      ? Date.now() + Number(tokenResponse.expires_in) * 1000
      : getTokenExpiresAt(tokenResponse.access_token)

    session.value = {
      accessToken: tokenResponse.access_token,
      idToken: tokenResponse.id_token || '',
      tokenType: tokenResponse.token_type || 'Bearer',
      scope: tokenResponse.scope || '',
      expiresAt,
      obtainedAt: Date.now(),
    }
    persistSession(session.value)
  }

  function clearSession() {
    session.value = null
    persistSession(null)
  }

  function hasPermission(code) {
    return permissionSet.value.has(code)
  }

  function hasAnyPermission(codes = []) {
    if (!codes.length) return true
    return codes.some((code) => permissionSet.value.has(code))
  }

  /**
   * 开始授权码登录。
   * @param {string} redirect 登录成功后要返回的内部路由
   */
  async function login(redirect = '/dashboard') {
    await beginLogin(redirect)
  }

  /**
   * 处理认证中心回调：校验 state、交换令牌、写入会话。
   * @returns {Promise<string>} 登录成功后应跳转的路由
   */
  async function completeLogin(code, state) {
    const saved = readOAuthState()
    if (!saved) {
      throw new Error('登录上下文已失效，请返回登录页重新发起登录')
    }
    if (saved.nonce !== state) {
      throw new Error('state 校验失败，登录请求可能被篡改，请重新登录')
    }

    const tokenResponse = await exchangeAuthorizationCode(code, saved.verifier)
    setSession(tokenResponse)
    clearOAuthState()
    return saved.redirect || '/dashboard'
  }

  function logout() {
    clearSession()
    clearOAuthState()
  }

  // 多标签页同步：一个标签页退出后，其他标签页立即失效。
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return
      session.value = readStoredSession()
    })
  }

  return {
    session,
    accessToken,
    idToken,
    claims,
    isAuthenticated,
    userId,
    username,
    nickname,
    employeeNo,
    factoryId,
    roles,
    permissions,
    permissionSet,
    displayName,
    tokenExpiresAt,
    setSession,
    clearSession,
    hasPermission,
    hasAnyPermission,
    login,
    completeLogin,
    logout,
  }
})
