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

const SHA256_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotateRight(value, bits) {
  return (value >>> bits) | (value << (32 - bits))
}

/**
 * 纯 JS SHA-256 回退实现。
 *
 * Web Crypto 的 subtle 接口只在安全上下文（HTTPS/localhost）可用。内网通过
 * http://IP 访问时 crypto.subtle 为 undefined，PKCE 计算不能依赖它。
 */
function sha256(bytes) {
  const length = bytes.length
  const paddedLength = Math.ceil((length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[length] = 0x80

  const input = new DataView(padded.buffer)
  input.setUint32(paddedLength - 8, Math.floor((length * 8) / 0x100000000))
  input.setUint32(paddedLength - 4, (length * 8) >>> 0)

  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const words = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = input.getUint32(offset + i * 4)
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ (words[i - 15] >>> 3)
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ (words[i - 2] >>> 10)
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0
    }

    let a = state[0]
    let b = state[1]
    let c = state[2]
    let d = state[3]
    let e = state[4]
    let f = state[5]
    let g = state[6]
    let h = state[7]

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + SHA256_CONSTANTS[i] + words[i]) >>> 0
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    state[0] = (state[0] + a) >>> 0
    state[1] = (state[1] + b) >>> 0
    state[2] = (state[2] + c) >>> 0
    state[3] = (state[3] + d) >>> 0
    state[4] = (state[4] + e) >>> 0
    state[5] = (state[5] + f) >>> 0
    state[6] = (state[6] + g) >>> 0
    state[7] = (state[7] + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const output = new DataView(digest.buffer)
  for (let i = 0; i < 8; i += 1) {
    output.setUint32(i * 4, state[i])
  }
  return digest
}

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
  const subtle = globalThis.crypto?.subtle
  const digest = subtle
    ? await subtle.digest('SHA-256', data)
    : sha256(data)
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
