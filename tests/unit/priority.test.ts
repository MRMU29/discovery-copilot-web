import { describe, expect, it } from 'vitest'
import { computePriorityScore } from '@/lib/priority'

describe('computePriorityScore — v2.1 公式 Impact × Risk × (1 − Confidence)', () => {
  it('null confidence（证据未评估）按 0 折扣处理，得满分验证权重', () => {
    expect(computePriorityScore({ impact: 5, risk: 4, confidence: null })).toBe(20)
  })

  it('confidence 0 与 null 等价', () => {
    expect(computePriorityScore({ impact: 5, risk: 4, confidence: 0 })).toBe(20)
  })

  it('confidence 1（证据充分）折零', () => {
    expect(computePriorityScore({ impact: 5, risk: 4, confidence: 1 })).toBe(0)
  })

  it('折扣项生效', () => {
    expect(computePriorityScore({ impact: 5, risk: 4, confidence: 0.5 })).toBe(10)
  })

  it('保留两位小数', () => {
    expect(computePriorityScore({ impact: 4, risk: 5, confidence: 0.333 })).toBe(13.34)
  })
})
