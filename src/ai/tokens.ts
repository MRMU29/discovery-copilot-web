import type { TokenPricing, Usage } from './types'

/**
 * Heuristic token estimation (§6.4 请求前预估). NOT an exact count — CJK text
 * averages ≈1 token per character, Latin text ≈1 token per 4 characters.
 * Good enough for cost pre-checks; real usage comes back from the provider.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const other = text.length - cjk
  return Math.ceil(cjk * 1 + other / 4)
}

export function estimateMessagesTokens(messages: { content: string }[]): number {
  // +4 overhead per message (role/format tokens), documented heuristic.
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0)
}

export interface CostEstimate {
  inputUsd: number
  outputUsd: number
  totalUsd: number
}

/** Cost from REAL usage + pricing table (§6.4 用量记录口径; 6 decimals). */
export function computeCost(usage: Usage, pricing: TokenPricing): CostEstimate {
  const inputUsd = round6((usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd)
  const outputUsd = round6((usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd)
  return { inputUsd, outputUsd, totalUsd: round6(inputUsd + outputUsd) }
}

export function estimateCostUsd(
  estimatedInputTokens: number,
  maxOutputTokens: number,
  pricing: TokenPricing,
): number {
  return round6(
    (estimatedInputTokens / 1_000_000) * pricing.inputPerMillionUsd +
      (maxOutputTokens / 1_000_000) * pricing.outputPerMillionUsd,
  )
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}
