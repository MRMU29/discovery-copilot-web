import { describe, expect, it } from 'vitest'
import { computeCost, estimateCostUsd, estimateMessagesTokens, estimateTokens } from '@/ai/tokens'
import type { TokenPricing } from '@/ai/types'

const pricing: TokenPricing = {
  inputPerMillionUsd: 2,
  outputPerMillionUsd: 8,
  currency: 'USD',
  pricingVersion: 'test-1',
  pricingUpdatedAt: '2026-10-01',
}

describe('estimateTokens — CJK/拉丁启发式（§6.4 请求前预估）', () => {
  it('empty text costs nothing', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('CJK ≈ 1 token per character', () => {
    expect(estimateTokens('你好世界')).toBe(4)
  })

  it('latin ≈ 1 token per 4 characters', () => {
    expect(estimateTokens('abcdefgh')).toBe(2)
  })

  it('mixed text rounds up', () => {
    expect(estimateTokens('你好ab')).toBe(3) // 2 + 0.5 → ceil
  })

  it('adds per-message overhead in estimateMessagesTokens', () => {
    expect(estimateMessagesTokens([{ content: '你好世界' }])).toBe(8) // 4 + 4
  })
})

describe('cost math (§6.4 用量口径, 6 位小数)', () => {
  it('computes input/output/total from real usage', () => {
    const cost = computeCost({ inputTokens: 500_000, outputTokens: 250_000 }, pricing)
    expect(cost).toEqual({ inputUsd: 1, outputUsd: 2, totalUsd: 3 })
  })

  it('keeps 6-decimal precision', () => {
    const cost = computeCost({ inputTokens: 333_333, outputTokens: 111_111 }, {
      ...pricing,
      inputPerMillionUsd: 3,
      outputPerMillionUsd: 9,
    })
    expect(cost.totalUsd).toBe(1.999998)
  })

  it('pre-request estimate uses max output tokens', () => {
    expect(estimateCostUsd(1_000_000, 500_000, pricing)).toBe(6) // 2 + 4
  })
})
