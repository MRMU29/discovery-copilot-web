import { describe, expect, it } from 'vitest'
import { summarizeUsage } from '@/ai/usage'
import type { AiRequest } from '@/schemas/entities'

function row(partial: Partial<AiRequest> & { id: number }): AiRequest {
  return {
    providerId: 'prov',
    projectId: null,
    model: 'deepseek-chat',
    kind: 'json',
    promptId: 'identify-assumptions',
    promptVersion: '1.0.0',
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: null,
    status: 'ok',
    errorCode: null,
    durationMs: 100,
    createdAt: '2026-10-04T08:00:00.000Z',
    ...partial,
  }
}

describe('summarizeUsage (§6.4 按日聚合)', () => {
  it('groups rows by day and sums tokens and costs', () => {
    const summary = summarizeUsage([
      row({ id: 1, createdAt: '2026-10-04T08:00:00.000Z', inputTokens: 100, outputTokens: 200, estimatedUsd: 0.0012 }),
      row({ id: 2, createdAt: '2026-10-04T09:00:00.000Z', inputTokens: 50, outputTokens: 80, estimatedUsd: 0.0008 }),
      row({ id: 3, createdAt: '2026-10-03T22:00:00.000Z', inputTokens: 10, outputTokens: 20, estimatedUsd: null, status: 'error' }),
    ])
    expect(summary.totalCount).toBe(3)
    expect(summary.totalInputTokens).toBe(160)
    expect(summary.totalOutputTokens).toBe(300)
    expect(summary.totalUsd).toBeCloseTo(0.002, 6)
    expect(summary.days).toHaveLength(2)
    expect(summary.days[0].date).toBe('2026-10-04') // 最近在前
    expect(summary.days[0].count).toBe(2)
    expect(summary.days[0].estimatedUsd).toBeCloseTo(0.002, 6)
    expect(summary.days[1].estimatedUsd).toBe(0)
  })

  it('returns an empty summary for no rows', () => {
    expect(summarizeUsage([])).toEqual({
      days: [],
      totalUsd: 0,
      totalCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    })
  })
})
