import { db } from '@/db/db'
import { aiRequestSchema, type AiRequest } from '@/schemas/entities'

/** Round to 6 decimals for stable budget math. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export async function recordAiRequest(input: Omit<AiRequest, 'id'>): Promise<void> {
  await db.ai_requests.add(aiRequestSchema.parse(input))
}

/** Current-natural-month usage (§6.4 用量视图/月度熔断口径), local-only. */
export async function getMonthUsage(now: Date = new Date()): Promise<{ totalUsd: number; requestCount: number }> {
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const rows = await db.ai_requests.filter((r) => r.createdAt.startsWith(ym)).toArray()
  return {
    totalUsd: round6(rows.reduce((sum, r) => sum + (r.estimatedUsd ?? 0), 0)),
    requestCount: rows.length,
  }
}

export interface UsageDaySummary {
  date: string
  count: number
  inputTokens: number
  outputTokens: number
  estimatedUsd: number
}

export interface UsageSummary {
  days: UsageDaySummary[]
  totalUsd: number
  totalCount: number
  totalInputTokens: number
  totalOutputTokens: number
}

/** 按日聚合（§6.4 用量视图）：纯函数，日期取 createdAt 前 10 位，倒序（最近在前）。 */
export function summarizeUsage(rows: AiRequest[]): UsageSummary {
  const byDay = new Map<string, UsageDaySummary>()
  for (const row of rows) {
    const date = row.createdAt.slice(0, 10)
    const day = byDay.get(date) ?? { date, count: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }
    day.count += 1
    day.inputTokens += row.inputTokens
    day.outputTokens += row.outputTokens
    day.estimatedUsd += row.estimatedUsd ?? 0
    byDay.set(date, day)
  }
  return {
    days: [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({ ...d, estimatedUsd: round6(d.estimatedUsd) })),
    totalUsd: round6(rows.reduce((sum, r) => sum + (r.estimatedUsd ?? 0), 0)),
    totalCount: rows.length,
    totalInputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0),
    totalOutputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0),
  }
}
