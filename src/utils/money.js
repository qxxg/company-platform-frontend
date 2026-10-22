/**
 * 金额工具：后端统一以“分”为整数存储，前端只做展示和输入转换。
 *
 * 不使用 Number 做乘法，避免 0.1 * 100 之类的浮点误差。输入转换使用 BigInt，
 * 小数位超过 2 位时直接截断（与 V1.4 财务规则一致，绝不四舍五入）。
 */

const CURRENCY_SYMBOLS = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
}

/**
 * 将用户输入的“元”字符串转换为“分”字符串（可直接放入 JSON，Long 不会丢精度）。
 * @param {string|number} value
 * @returns {string}
 */
export function yuanToCents(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+(\.\d*)?$/.test(text)) {
    throw new Error('金额格式不正确，请输入大于 0 的数字')
  }
  const [wholePart, fractionPart = ''] = text.split('.')
  const fraction = (fractionPart + '00').slice(0, 2)
  return (BigInt(wholePart || '0') * 100n + BigInt(fraction)).toString()
}

/**
 * 将“分”格式化为带两位小数的“元”字符串。
 * @param {string|number|bigint|null|undefined} cents
 */
export function centsToYuan(cents) {
  if (cents === null || cents === undefined || cents === '') return '0.00'
  try {
    const value = BigInt(String(cents))
    const negative = value < 0n
    const absolute = negative ? -value : value
    const yuan = absolute / 100n
    const fraction = (absolute % 100n).toString().padStart(2, '0')
    return `${negative ? '-' : ''}${yuan}.${fraction}`
  } catch {
    return '0.00'
  }
}

/**
 * 展示金额，默认人民币。千分位分组使用字符串处理，避免大整数精度损失。
 */
export function formatMoney(cents, currency = 'CNY') {
  if (cents === null || cents === undefined || cents === '') return '—'
  const [integerPart, fractionPart] = centsToYuan(cents).split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  return `${symbol}${grouped}.${fractionPart}`
}

/** 输入框提示/摘要中使用，不带货币符号。 */
export function formatCentsPlain(cents) {
  return centsToYuan(cents)
}
