import { describe, expect, it } from 'vitest'
import { PRICING_VERSION, resolvePricing } from '@/ai/pricing'

describe('resolvePricing (§6.4 内置参考价)', () => {
  it('matches common providers case-insensitively with full pricing metadata', () => {
    for (const model of ['deepseek-chat', 'DeepSeek-R1', 'kimi-k2', 'glm-4.5', 'gemini-2.5-flash', 'gpt-4o-mini']) {
      const pricing = resolvePricing(model)
      expect(pricing, model).not.toBeNull()
      expect(pricing!.currency).toBe('USD')
      expect(pricing!.pricingVersion).toBe(PRICING_VERSION)
      expect(pricing!.pricingUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(pricing!.inputPerMillionUsd).toBeGreaterThan(0)
      expect(pricing!.outputPerMillionUsd).toBeGreaterThan(0)
    }
  })

  it('prefers the more specific rule (deepseek-reasoner over deepseek)', () => {
    const reasoner = resolvePricing('deepseek-reasoner')!
    const chat = resolvePricing('deepseek-chat')!
    expect(reasoner.outputPerMillionUsd).toBeGreaterThan(chat.outputPerMillionUsd)
  })

  it('returns null for unknown models (计费未知)', () => {
    expect(resolvePricing('my-private-model-v9')).toBeNull()
    expect(resolvePricing('')).toBeNull()
  })
})
