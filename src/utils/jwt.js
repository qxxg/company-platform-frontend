/**
 * JWT 解析工具。
 *
 * 说明：这里只做 Base64URL 解码，用于界面展示和权限隐藏，不能作为安全边界。
 * 真正的权限校验由网关验签 + 各微服务 @PreAuthorize 完成。
 */

function base64UrlToUtf8(input) {
  if (!input) return ''
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * @param {string} token access_token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(base64UrlToUtf8(parts[1]))
  } catch {
    return null
  }
}

/**
 * 判断令牌是否已过期。默认提前 20 秒视为过期，避免临界点请求失败。
 */
export function isTokenExpired(token, skewSeconds = 20) {
  const claims = decodeJwt(token)
  if (!claims || typeof claims.exp !== 'number') return true
  return claims.exp * 1000 <= Date.now() + skewSeconds * 1000
}

export function getTokenExpiresAt(token) {
  const claims = decodeJwt(token)
  return typeof claims?.exp === 'number' ? claims.exp * 1000 : 0
}

export function getTokenRemainingSeconds(token) {
  const expiresAt = getTokenExpiresAt(token)
  if (!expiresAt) return 0
  return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
}
