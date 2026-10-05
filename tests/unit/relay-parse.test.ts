import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseRelayResult } from '@/ai/relay/parse'

// 本地 schema（不引入 db 链）：结构与 experimentSuggestionSchema 同形。
const schema = z.object({
  experiments: z.array(
    z.object({
      hypothesis: z.string().min(5),
      method: z.string().min(1),
      successCriteria: z.string().min(1),
    }),
  ),
})

const valid = {
  experiments: [
    {
      hypothesis: '若提供一键导入模板，则 60% 以上用户能在 5 分钟内完成首次导入',
      method: '假门测试：引导页放置入口，运行 7 天记录点击',
      successCriteria: '入口点击率 ≥ 25%',
    },
  ],
}

describe('parseRelayResult', () => {
  it('parses a pure JSON payload', () => {
    const result = parseRelayResult(JSON.stringify(valid), schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual(valid)
  })

  it('parses a markdown-fenced payload', () => {
    const raw = '```json\n' + JSON.stringify(valid, null, 2) + '\n```'
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(true)
  })

  it('extracts JSON from prose before and after (first { to last })', () => {
    const raw = `好的，这是我设计的实验方案：\n${JSON.stringify(valid)}\n以上供参考，如需调整告诉我。`
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.experiments[0].hypothesis).toContain('一键导入')
  })

  it('normalizes snake_case and mixed-case keys', () => {
    const raw = JSON.stringify({
      Experiments: [
        {
          Hypothesis: valid.experiments[0].hypothesis,
          Method: valid.experiments[0].method,
          success_criteria: valid.experiments[0].successCriteria,
        },
      ],
    })
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.experiments[0].hypothesis).toBe(valid.experiments[0].hypothesis)
      expect(result.data.experiments[0].successCriteria).toBe(valid.experiments[0].successCriteria)
    }
  })

  it('wraps a bare array into the schema envelope when unambiguous', () => {
    const raw = JSON.stringify(valid.experiments)
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.experiments).toHaveLength(1)
  })

  it('reports schema violations with readable field paths', () => {
    const raw = JSON.stringify({ experiments: [{ hypothesis: '短', method: '', successCriteria: 'x' }] })
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes('experiments.0.hypothesis'))).toBe(true)
      expect(result.issues.some((i) => i.includes('experiments.0.method'))).toBe(true)
    }
  })

  it('keeps the raw text intact on failure', () => {
    const raw = '抱歉，我无法输出 JSON。这是一个完全无关的回答。'
    const result = parseRelayResult(raw, schema)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toContain('未能在粘贴内容中找到 JSON 对象')
      expect(result.raw).toBe(raw)
    }
  })

  it('rejects empty paste with a dedicated message', () => {
    const result = parseRelayResult('   \n  ', schema)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toContain('粘贴内容为空')
  })
})
