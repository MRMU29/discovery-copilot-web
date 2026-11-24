import { describe, expect, it } from 'vitest'
import { parseAssumptionBatch } from '@/lib/assumption-batch'

describe('parseAssumptionBatch', () => {
  it('parses the four supported shapes with the documented defaults', () => {
    const { rows, errors } = parseAssumptionBatch(
      [
        'value | 用户愿意为自动对账付费 | 5 | 4',
        'usability | 新用户能在 5 分钟内完成首次导入 | 4',
        'feasibility | 浏览器直连 AI 可行',
        '团队愿意接受每周一次复盘',
      ].join('\n'),
    )
    expect(errors).toEqual([])
    expect(rows).toHaveLength(4)

    expect(rows[0]).toMatchObject({ type: 'value', impact: 5, risk: 4, usedDefaults: false })
    expect(rows[1]).toMatchObject({ type: 'usability', impact: 4, risk: 3, usedDefaults: true })
    expect(rows[2]).toMatchObject({ type: 'feasibility', impact: 3, risk: 3, usedDefaults: true })
    expect(rows[3]).toMatchObject({
      type: 'value',
      statement: '团队愿意接受每周一次复盘',
      impact: 3,
      risk: 3,
      usedDefaults: true,
    })
  })

  it('accepts the full-width separator and Chinese type labels', () => {
    const { rows, errors } = parseAssumptionBatch('价值｜用户愿意为自动对账付费｜5｜4')
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ type: 'value', impact: 5, risk: 4 })
  })

  it('maps the hyphenated go-to-market key through its dictionary label', () => {
    expect(parseAssumptionBatch('go-to-market | 能通过渠道触达客户 | 3 | 3').rows[0].type).toBe('go-to-market')
    expect(parseAssumptionBatch('市场进入 | 能通过渠道触达客户 | 3 | 3').rows[0].type).toBe('go-to-market')
  })

  it('ignores blank lines and comments but keeps original line numbers', () => {
    const { rows, errors } = parseAssumptionBatch(
      ['# 这是注释', '', 'value | 第一条 | 5 | 4', '', 'usability | 第二条'].join('\n'),
    )
    expect(errors).toEqual([])
    expect(rows.map((r) => r.line)).toEqual([3, 5])
  })

  it('reports bad lines without blocking the good ones', () => {
    const { rows, errors } = parseAssumptionBatch(
      [
        'nonsense | 类型不存在 | 5 | 4',
        'value | 影响越界 | 0 | 4',
        'value | 风险越界 | 3 | 6',
        'value |   | 3 | 3',
        `value | ${'长'.repeat(2001)} | 3 | 3`,
        'value | a | 3 | 3 | extra',
        'value | 合法的一条 | 3 | 3',
      ].join('\n'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].statement).toBe('合法的一条')
    expect(errors.map((e) => e.reason)).toEqual(['type', 'impact', 'risk', 'statement', 'length', 'columns'])
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('trims whitespace around every cell', () => {
    const { rows } = parseAssumptionBatch('  value  |   陈述带空格   |  5 | 4  ')
    expect(rows[0]).toMatchObject({ type: 'value', statement: '陈述带空格', impact: 5, risk: 4 })
  })
})
