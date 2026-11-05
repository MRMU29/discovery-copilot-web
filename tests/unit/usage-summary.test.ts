import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getMonthUsage, summarizeUsage } from '@/ai/usage'
import { db, resetDb } from '@/db/db'
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

describe('getMonthUsage (§6.4 月度口径 · UTC 与 createdAt 一致)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('counts the UTC month at the UTC+8 month-start boundary (本地已跨月、UTC 仍是上月)', async () => {
    // now = 2026-11-01 00:30 (UTC+8) === 2026-10-31 16:30 UTC.
    // createdAt 由 nowIso() 写成 UTC ISO，月度 ym 必须按 UTC 取，
    // 否则本地月份已是 11 月却要拿 '2026-11' 去比 '2026-10-…' 前缀，月初数据被漏算。
    const now = new Date('2026-10-31T16:30:00.000Z')
    await db.ai_requests.bulkPut([
      row({ id: 1, createdAt: '2026-10-01T00:00:00.000Z', estimatedUsd: 4 }), // UTC 10 月初
      row({ id: 2, createdAt: '2026-10-31T23:59:59.000Z', estimatedUsd: 1 }), // UTC 10 月末
      row({ id: 3, createdAt: '2026-11-01T00:00:01.000Z', estimatedUsd: 2 }), // UTC 11 月初（应排除）
    ])
    const usage = await getMonthUsage(now)
    expect(usage.requestCount).toBe(2)
    expect(usage.totalUsd).toBeCloseTo(5, 6)
  })

  it('counts the UTC month at the UTC+8 month-end boundary (本地已跨到下月)', async () => {
    // now = 2026-12-01 00:30 (UTC+8) === 2026-11-30 16:30 UTC.
    const now = new Date('2026-11-30T16:30:00.000Z')
    await db.ai_requests.bulkPut([
      row({ id: 1, createdAt: '2026-11-01T00:00:00.000Z', estimatedUsd: 1 }), // UTC 11 月初
      row({ id: 2, createdAt: '2026-11-30T23:59:00.000Z', estimatedUsd: 2 }), // UTC 11 月末
      row({ id: 3, createdAt: '2026-12-01T00:00:00.000Z', estimatedUsd: 8 }), // UTC 12 月（应排除）
    ])
    const usage = await getMonthUsage(now)
    expect(usage.requestCount).toBe(2)
    expect(usage.totalUsd).toBeCloseTo(3, 6)
  })
})
