import type { TokenPricing } from './types'

/**
 * 内置模型参考价（§6.4）：用于请求前 Token/费用预估与预算熔断阈值判断。
 * 计费差异提示（§6.4）：这是**内置参考价，可能过期**——实际费用以 Provider
 * 账单为准，产品不承诺准确性；所有展示处必须带此标注。模型不在表内时
 * resolvePricing 返回 null（计费未知，不预估、不熔断）。
 */

export const PRICING_VERSION = 'builtin-2026-10'
export const PRICING_UPDATED_AT = '2026-10-01'

const PRICING_TABLE: { pattern: RegExp; inputPerMillionUsd: number; outputPerMillionUsd: number }[] = [
  { pattern: /deepseek-reasoner/i, inputPerMillionUsd: 0.55, outputPerMillionUsd: 2.19 },
  { pattern: /deepseek/i, inputPerMillionUsd: 0.27, outputPerMillionUsd: 1.1 },
  { pattern: /kimi|moonshot/i, inputPerMillionUsd: 0.6, outputPerMillionUsd: 2.5 },
  { pattern: /glm/i, inputPerMillionUsd: 0.5, outputPerMillionUsd: 1.2 },
  { pattern: /gemini-2\.5-flash/i, inputPerMillionUsd: 0.3, outputPerMillionUsd: 2.5 },
  { pattern: /gemini-.*flash/i, inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.4 },
  { pattern: /gemini/i, inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
  { pattern: /gpt-4o-mini|gpt-4\.1-mini|gpt-4\.1-nano/i, inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  { pattern: /gpt-4o|gpt-4\.1/i, inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
  { pattern: /gpt-5|o[34]-/i, inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
]

/** Resolve the built-in reference pricing for a model id; null = 计费未知。 */
export function resolvePricing(model: string): TokenPricing | null {
  const hit = PRICING_TABLE.find((entry) => entry.pattern.test(model))
  if (!hit) return null
  return {
    inputPerMillionUsd: hit.inputPerMillionUsd,
    outputPerMillionUsd: hit.outputPerMillionUsd,
    currency: 'USD',
    pricingVersion: PRICING_VERSION,
    pricingUpdatedAt: PRICING_UPDATED_AT,
  }
}
