import { describe, expect, it } from 'vitest'
import { analyzeInputQuality } from '@/lib/input-quality'

const GOOD = '面向自由职业者的 AI 记账助手：自动导入每月 20–100 张发票，自动分类支出并生成报税草稿，目标在 3 分钟内完成整理。'

describe('analyzeInputQuality', () => {
  it('warns on a too-short description', () => {
    const result = analyzeInputQuality('帮人记账的工具')
    expect(result.level).toBe('warn')
    expect(result.issues.some((i) => i.includes('描述过短'))).toBe(true)
  })

  it('warns when no quantified info is present', () => {
    const result = analyzeInputQuality(
      '面向自由职业者的记账助手，自动导入发票并生成报税草稿，帮助他们整理支出。',
    )
    expect(result.issues.some((i) => i.includes('数字'))).toBe(true)
  })

  it('warns when no target audience is mentioned', () => {
    const result = analyzeInputQuality(
      '一个自动导入 100 张发票并生成报税草稿的记账工具，全程在浏览器里完成。',
    )
    expect(result.issues.some((i) => i.includes('目标人群'))).toBe(true)
  })

  it('warns on hedged wording', () => {
    const result = analyzeInputQuality(
      '面向自由职业者的记账助手，每月大概处理 100 张发票，可能自动生成报税草稿。',
    )
    expect(result.issues.some((i) => i.includes('模糊表述') && i.includes('大概'))).toBe(true)
  })

  it('returns ok for a concrete, quantified, audience-aware description', () => {
    const result = analyzeInputQuality(GOOD)
    expect(result).toEqual({ level: 'ok', issues: [] })
  })
})
