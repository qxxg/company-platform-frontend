/**
 * OAuth2 授权码 + PKCE 工具。
 *
 * pc-web 是公开客户端，不保存 client_secret。浏览器生成 code_verifier，
 * 将其 SHA-256 摘要作为 code_challenge 发给认证中心，换取令牌时再提交
 * 原始 verifier。认证中心据此确认“换令牌的人就是发起授权的人”。
 */

const STATE_STORAGE_KEY = 'company.platform.oauth.state'
const OAUTH_CALLBACK_PATH = '/login/oauth2/code/pc-web'
const STATE_MAX_AGE_MS = 15 * 60 * 1000

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

/**
 * 认证中心地址。默认使用当前访问主机的 9000 端口，因此 localhost 和
 * 内网 IP 访问都能自动适配；生产环境可通过 VITE_AUTH_BASE_URL 覆盖。
 */
export function getAuthBaseUrl() {
  const configured = (import.meta.env.VITE_AUTH_BASE_URL || '').trim()
  if (configured) return trimTrailingSlash(configured)
  return `${window.location.protocol}//${window.location.hostname}:9000`
}

export function getOAuthRedirectUri() {
  const configured = (import.meta.env.VITE_OAUTH_REDIRECT_URI || '').trim()
  if (configured) return configured
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`
}

export function getOAuthClientId() {
  return (import.meta.env.VITE_OAUTH_CLIENT_ID || 'pc-web').trim()
}

function randomUrlSafe(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  let binary = ''
  new Uint8Array(digest).forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function normalizeInternalRedirect(value) {
  const fallback = '/dashboard'
  if (!value || typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback
  return value
}

/**
 * 发起登录。会先保存 state 与 verifier，然后跳转到认证中心。
 * @param {string} redirectPath 登录成功后返回的内部路由
 */
export async function beginLogin(redirectPath = '/dashboard') {
  const verifier = randomUrlSafe(48)
  const nonce = randomUrlSafe(32)
  const challenge = await sha256Base64Url(verifier)

  sessionStorage.setItem(
    STATE_STORAGE_KEY,
    JSON.stringify({
      nonce,
      verifier,
      redirect: normalizeInternalRedirect(redirectPath),
      createdAt: Date.now(),
    }),
  )

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getOAuthClientId(),
    redirect_uri: getOAuthRedirectUri(),
    scope: 'openid profile system.read system.write order.read order.write',
    state: nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(`${getAuthBaseUrl()}/oauth2/authorize?${params.toString()}`)
}

/**
 * 读取并校验保存在当前标签页中的授权请求上下文。
 * 使用 sessionStorage 而不是 localStorage，避免多个标签页串用 PKCE verifier。
 */
export function readOAuthState() {
  const raw = sessionStorage.getItem(STATE_STORAGE_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!value?.nonce || !value?.verifier || !value?.createdAt) return null
    if (Date.now() - value.createdAt > STATE_MAX_AGE_MS) {
      clearOAuthState()
      return null
    }
    return value
  } catch {
    clearOAuthState()
    return null
  }
}

export function clearOAuthState() {
  sessionStorage.removeItem(STATE_STORAGE_KEY)
}

/**
 * 使用授权码换取 access_token。
 * @param {string} code 认证中心回调的授权码
 * @param {string} verifier 发起授权时保存的 PKCE code_verifier
 */
export async function exchangeAuthorizationCode(code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getOAuthClientId(),
    redirect_uri: getOAuthRedirectUri(),
    code,
    code_verifier: verifier,
  })

  const response = await fetch(`${getAuthBaseUrl()}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) {
    const reason = payload?.error_description || payload?.error || `HTTP ${response.status}`
    throw new Error(`令牌交换失败：${reason}`)
  }
  return payload
}
