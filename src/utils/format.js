/**
 * 通用展示格式化工具。
 */

export function formatDateTime(value) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatUnixSeconds(seconds) {
  if (!seconds) return '—'
  return formatDateTime(new Date(seconds * 1000))
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  if (minutes > 0) return `${minutes} 分钟`
  return `${total} 秒`
}

export function initialsOf(name) {
  const value = (name || '').trim()
  if (!value) return '?'
  // 中文名取前两个字，避免“系统管理员”这类显示名只露出“理员”；
  // 英文名取前两个单词的首字母。
  if (/[\u4e00-\u9fa5]/.test(value)) return value.slice(0, 2)
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function maskToken(token) {
  if (!token) return '—'
  if (token.length <= 24) return token
  return `${token.slice(0, 12)}…${token.slice(-10)}`
}

export function truncateMiddle(value, head = 8, tail = 6) {
  const text = String(value || '')
  if (text.length <= head + tail + 1) return text
  return `${text.slice(0, head)}…${text.slice(-tail)}`
}
