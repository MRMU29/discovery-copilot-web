import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { AI_USAGE_RETENTION_MONTHS, getMonthUsage, pruneOldAiRequests } from '@/ai/usage'

function row(createdAt: string, estimatedUsd = 0.01) {
  return {
    providerId: 'p1',
    projectId: null,
    model: 'm',
    kind: 'text' as const,
    promptId: 'identify-assumptions',
    promptVersion: '1.0.0',
    inputTokens: 10,
    outputTokens: 5,
    estimatedUsd,
    status: 'ok' as const,
    errorCode: null,
    durationMs: 1,
    createdAt,
  }
}

const NOW = new Date('2026-11-24T00:00:00.000Z')

describe('AI usage ledger retention + indexed month query', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('drops rows older than the retention window and keeps recent ones', async () => {
    const stale = new Date(
      Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - AI_USAGE_RETENTION_MONTHS - 1, 15),
    ).toISOString()
    await db.ai_requests.bulkAdd([row(stale), row('2026-11-02T00:00:00.000Z')])
    expect(await db.ai_requests.count()).toBe(2)

    expect(await pruneOldAiRequests(NOW)).toBe(1)
    expect(await db.ai_requests.count()).toBe(1)
  })

  it('getMonthUsage only counts the current UTC month', async () => {
    await db.ai_requests.bulkAdd([
      row('2026-11-01T00:00:00.000Z', 0.5),
      row('2026-11-30T23:59:59.000Z', 0.25),
      row('2026-10-31T23:59:59.000Z', 9),
    ])
    const usage = await getMonthUsage(NOW)
    expect(usage.requestCount).toBe(2)
    expect(usage.totalUsd).toBe(0.75)
  })
})
