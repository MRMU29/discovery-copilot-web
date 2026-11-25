import { db } from '@/db/db'
import { aiRequestSchema, type AiRequest } from '@/schemas/entities'

/** Round to 6 decimals for stable budget math. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

export async function recordAiRequest(input: Omit<AiRequest, 'id'>): Promise<void> {
  await db.ai_requests.add(aiRequestSchema.parse(input))
}

/** 账本保留期（§audit P1-5）：超过 12 个月的用量记录在启动时清理。 */
export const AI_USAGE_RETENTION_MONTHS = 12

/**
 * Current-UTC-month usage (§6.4 用量视图/月度熔断口径), local-only.
 * `createdAt` 是索引字段，用 startsWith 走索引区间，不再全表 filter。
 */
export async function getMonthUsage(now: Date = new Date()): Promise<{ totalUsd: number; requestCount: number }> {
  // createdAt 由 nowIso() 写成 UTC ISO 串；月度前缀必须同样按 UTC 取，
  // 否则 UTC+8 的月初/月末会把本地月份错配到 UTC 日期前缀上。
  const ym = now.toISOString().slice(0, 7)
  const rows = await db.ai_requests.where('createdAt').startsWith(ym).toArray()
  return {
    totalUsd: round6(rows.reduce((sum, r) => sum + (r.estimatedUsd ?? 0), 0)),
    requestCount: rows.length,
  }
}

/**
 * 删除保留期之前的用量记录，返回删除条数（启动时 best-effort 调用）。
 * 只动本机 `ai_requests` 账本，不触碰产品数据；成本预估与月度熔断只看近 12 个月。
 */
export async function pruneOldAiRequests(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - AI_USAGE_RETENTION_MONTHS, 1),
  ).toISOString()
  return db.ai_requests.where('createdAt').below(cutoff).delete()
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

/** Earliest ISO timestamp the usage view needs: 30 days back or the UTC month start, whichever is earlier. */
export function usageSinceIso(now: Date = new Date(), days = 30): string {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const windowStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000
  return new Date(Math.min(monthStart, windowStart)).toISOString()
}

/**
 * Zero-filled UTC day window, oldest → newest. Charts need the zeros: a gap in
 * usage must read as "no requests", not "no data". Rows outside the window are
 * ignored so a wide query cannot distort the chart.
 */
export function usageWindow(rows: AiRequest[], now: Date = new Date(), days = 30): UsageDaySummary[] {
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
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const out: UsageDaySummary[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 86_400_000).toISOString().slice(0, 10)
    const day = byDay.get(date)
    out.push(day ? { ...day, estimatedUsd: round6(day.estimatedUsd) } : { date, count: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 })
  }
  return out
}

export interface UsageTaskSummary {
  promptId: string
  count: number
  estimatedUsd: number
}

/** Task mix by prompt id, costliest first (ties broken by request count). */
export function groupUsageByPrompt(rows: AiRequest[]): UsageTaskSummary[] {
  const byPrompt = new Map<string, UsageTaskSummary>()
  for (const row of rows) {
    const entry = byPrompt.get(row.promptId) ?? { promptId: row.promptId, count: 0, estimatedUsd: 0 }
    entry.count += 1
    entry.estimatedUsd += row.estimatedUsd ?? 0
    byPrompt.set(row.promptId, entry)
  }
  return [...byPrompt.values()]
    .map((entry) => ({ ...entry, estimatedUsd: round6(entry.estimatedUsd) }))
    .sort((a, b) => b.estimatedUsd - a.estimatedUsd || b.count - a.count)
}

/**
 * CSV export (§v0.2.4 usage view). The ledger has no prompt text and no key by
 * construction, so "no Prompt / no Key" is structural rather than filtered.
 * BOM + CRLF keep Excel on Windows from mangling non-ASCII project ids.
 */
export const USAGE_CSV_COLUMNS = [
  'createdAt',
  'providerId',
  'model',
  'kind',
  'promptId',
  'promptVersion',
  'inputTokens',
  'outputTokens',
  'estimatedUsd',
  'status',
  'errorCode',
  'durationMs',
] as const

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function usageCsv(rows: AiRequest[]): string {
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const lines = [USAGE_CSV_COLUMNS.join(',')]
  for (const row of ordered) {
    lines.push(
      [
        row.createdAt,
        row.providerId,
        row.model,
        row.kind,
        row.promptId,
        row.promptVersion,
        row.inputTokens,
        row.outputTokens,
        row.estimatedUsd,
        row.status,
        row.errorCode,
        row.durationMs,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\r\n')}`
}
