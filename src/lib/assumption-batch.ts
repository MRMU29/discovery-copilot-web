import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import { ASSUMPTION_TYPES, type Assumption } from '@/schemas/entities'
import { zhHans } from '@/lib/i18n/dictionaries/zh-Hans'

/**
 * Bulk-paste parser (§roadmap 4.3). One assumption per line, `|` (or the
 * full-width `｜`) as separator:
 *
 *   value | 用户愿意为自动对账付费 | 5 | 4
 *   value | 用户愿意为自动对账付费 | 5      (risk defaults to 3)
 *   value | 用户愿意为自动对账付费          (impact & risk default to 3)
 *   用户愿意为自动对账付费                 (type defaults to value)
 *
 * Bad lines are reported, never thrown: a paste of 20 lines with 2 typos
 * should still let the user apply the 18 good ones. Reasons are enums so the
 * dialog owns all user-facing copy (services/lib must not hardcode UI text).
 */

export type AssumptionType = Assumption['type']

export type BatchErrorReason = 'type' | 'impact' | 'risk' | 'statement' | 'length' | 'columns'

export interface BatchRow {
  /** 1-based line number in the original text (comments/blank lines still count). */
  line: number
  type: AssumptionType
  statement: string
  impact: number
  risk: number
  /** True when type/impact/risk came from defaults rather than the paste. */
  usedDefaults: boolean
}

export interface BatchError {
  line: number
  raw: string
  reason: BatchErrorReason
}

const TYPE_ALIASES = new Map<string, AssumptionType>()
for (const type of ASSUMPTION_TYPES) {
  TYPE_ALIASES.set(type.toLowerCase(), type)
  const label = (zhHans as Record<string, string>)[ASSUMPTION_TYPE_META[type].labelKey]
  if (label) TYPE_ALIASES.set(label.trim().toLowerCase(), type)
}

function parseLevel(token: string): number | null {
  if (!/^[1-5]$/.test(token)) return null
  return Number(token)
}

export function parseAssumptionBatch(text: string): { rows: BatchRow[]; errors: BatchError[] } {
  const rows: BatchRow[] = []
  const errors: BatchError[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1
    const raw = rawLine.trim()
    if (!raw || raw.startsWith('#')) return

    const parts = raw.split(/[|｜]/).map((part) => part.trim())
    if (parts.length > 4) {
      errors.push({ line, raw, reason: 'columns' })
      return
    }

    const [first = '', second = '', third = '', fourth = ''] = parts
    const singleColumn = parts.length === 1
    const typeToken = singleColumn ? 'value' : first
    const statement = singleColumn ? first : second
    const impactToken = parts.length >= 3 ? third : ''
    const riskToken = parts.length === 4 ? fourth : ''

    const type = TYPE_ALIASES.get(typeToken.toLowerCase())
    if (!type) {
      errors.push({ line, raw, reason: 'type' })
      return
    }
    if (!statement) {
      errors.push({ line, raw, reason: 'statement' })
      return
    }
    if (statement.length > 2000) {
      errors.push({ line, raw, reason: 'length' })
      return
    }
    const impact = impactToken ? parseLevel(impactToken) : 3
    if (impact === null) {
      errors.push({ line, raw, reason: 'impact' })
      return
    }
    const risk = riskToken ? parseLevel(riskToken) : 3
    if (risk === null) {
      errors.push({ line, raw, reason: 'risk' })
      return
    }

    rows.push({
      line,
      type,
      statement,
      impact,
      risk,
      usedDefaults: parts.length < 4 || !impactToken || !riskToken,
    })
  })

  return { rows, errors }
}
