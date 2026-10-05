/**
 * AI error taxonomy (plan v2.1 §6.2/§6.4): every failure surfaces as a typed
 * AIError. Browsers cannot distinguish CORS blocks from dead networks (both
 * surface as `TypeError: Failed to fetch`), so both map to NETWORK — the
 * message guides the user toward a compatible proxy instead of pretending we
 * know the cause (§6.2 边界).
 */

export type AIErrorCode =
  | 'NOT_CONFIGURED' // no provider selected / no key in session
  | 'UNAUTHORIZED' // 401/403 — key missing or wrong
  | 'RATE_LIMITED' // 429
  | 'TIMEOUT' // AbortSignal.timeout fired
  | 'NETWORK' // fetch TypeError (含 CORS——见模块注释)
  | 'PARSE' // HTTP ok but body/JSON unusable (含修复重试后仍失败)
  | 'ABORTED' // user-cancelled
  | 'BUDGET' // 熔断：月度/单次预算超限（§6.4，进入确认流程而非静默失败）
  | 'UNKNOWN'

const STATUS_MAP: Record<number, AIErrorCode> = {
  401: 'UNAUTHORIZED',
  403: 'UNAUTHORIZED',
  429: 'RATE_LIMITED',
}

export class AIError extends Error {
  readonly code: AIErrorCode
  /** HTTP status when the failure came from a response. */
  readonly status?: number

  constructor(code: AIErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.status = status
  }
}

const USER_MESSAGES: Record<AIErrorCode, string> = {
  NOT_CONFIGURED: '尚未配置 AI Provider 或未在会话中提供 API Key（设置 → AI Provider）。',
  UNAUTHORIZED: 'API Key 无效或无权限，请在设置中检查 Key。',
  RATE_LIMITED: '请求过于频繁（429），请稍后重试。',
  TIMEOUT: '请求超时，请检查网络或稍后重试。',
  NETWORK:
    '网络请求失败。可能是网络不可用，或该服务不允许浏览器直连（CORS）——可在设置中改用兼容代理地址。',
  PARSE: 'AI 返回内容无法解析为有效结果（已自动重试一次）。',
  ABORTED: '请求已取消。',
  BUDGET: '已达到预算阈值，请求被熔断。可在设置中调整预算或确认后继续。',
  UNKNOWN: '发生未知错误。',
}

export function userMessage(code: AIErrorCode): string {
  // 设备离线时给比「可能是 CORS」更精准的引导（§8.3 可读错误）。
  if (code === 'NETWORK' && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前设备处于离线状态，无法调用 AI 服务；本地功能与数据不受影响。恢复网络后重试。'
  }
  return USER_MESSAGES[code]
}

/**
 * Map a thrown value + optional HTTP status to an AIError. Recognizes:
 * AbortError with timeout reason → TIMEOUT; user abort → ABORTED;
 * TypeError from fetch → NETWORK; AIError passes through untouched.
 */
export function classifyAIError(err: unknown, status?: number): AIError {
  if (err instanceof AIError) return err
  if (err instanceof DOMException && err.name === 'AbortError') {
    const reason = (err as DOMException & { reason?: unknown }).reason
    if (reason instanceof DOMException && reason.name === 'TimeoutError') {
      return new AIError('TIMEOUT', userMessage('TIMEOUT'))
    }
    return new AIError('ABORTED', userMessage('ABORTED'))
  }
  if (err instanceof TypeError) {
    return new AIError('NETWORK', userMessage('NETWORK'))
  }
  if (status != null && STATUS_MAP[status]) {
    return new AIError(STATUS_MAP[status], userMessage(STATUS_MAP[status]), status)
  }
  return new AIError('UNKNOWN', err instanceof Error ? err.message : userMessage('UNKNOWN'))
}
