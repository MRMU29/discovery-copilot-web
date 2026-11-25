import { describe, expect, it } from 'vitest'
import type { AiRequest } from '@/schemas/entities'
import {
  groupUsageByPrompt,
  usageCsv,
  usageSinceIso,
  usageWindow,
  USAGE_CSV_COLUMNS,
} from '@/ai/usage'

function row(overrides: Partial<AiRequest> = {}): AiRequest {
  return {
    providerId: 'p1',
    projectId: null,
    model: 'gpt-x',
    kind: 'json',
    promptId: 'identify-assumptions',
    promptVersion: '1.2.0',
    inputTokens: 10,
    outputTokens: 20,
    estimatedUsd: 0.01,
    status: 'ok',
    errorCode: null,
    durationMs: 1200,
    createdAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('usageWindow', () => {
  it('returns a zero-filled window oldest → newest', () => {
    const now = new Date('2026-11-25T12:00:00.000Z')
    const days = usageWindow([], now, 30)
    expect(days).toHaveLength(30)
    expect(days[0].date).toBe('2026-10-27')
    expect(days.at(-1)?.date).toBe('2026-11-25')
    expect(days.every((day) => day.count === 0)).toBe(true)
  })

  it('sums rows into their UTC day and ignores rows outside the window', () => {
    const now = new Date('2026-11-25T12:00:00.000Z')
    const days = usageWindow(
      [
        row({ createdAt: '2026-11-25T01:00:00.000Z' }),
        row({ createdAt: '2026-11-25T23:00:00.000Z', inputTokens: 5, estimatedUsd: 0.02 }),
        row({ createdAt: '2026-01-01T00:00:00.000Z' }), // far outside
      ],
      now,
      30,
    )
    const today = days.at(-1)
    expect(today).toMatchObject({ date: '2026-11-25', count: 2, inputTokens: 15 })
    expect(today?.estimatedUsd).toBe(0.03)
  })
})

describe('usageSinceIso', () => {
  it('picks the UTC month start when it is earlier than the 30-day window', () => {
    // Nov 5: 30 days back = Oct 7, month start = Nov 1 → Oct 7 wins.
    expect(usageSinceIso(new Date('2026-11-05T08:00:00.000Z'))).toBe('2026-10-07T00:00:00.000Z')
  })

  it('picks the 30-day window when the month started long ago', () => {
    // Nov 25: month start = Nov 1, window = Oct 27 → Oct 27 wins.
    expect(usageSinceIso(new Date('2026-11-25T08:00:00.000Z'))).toBe('2026-10-27T00:00:00.000Z')
  })
})

describe('groupUsageByPrompt', () => {
  it('orders by cost, then by count', () => {
    const groups = groupUsageByPrompt([
      row({ promptId: 'a', estimatedUsd: 0.05 }),
      row({ promptId: 'a', estimatedUsd: 0.05 }),
      row({ promptId: 'b', estimatedUsd: 0.2 }),
      row({ promptId: 'c', estimatedUsd: 0.01 }),
    ])
    expect(groups.map((g) => g.promptId)).toEqual(['b', 'a', 'c'])
    expect(groups[1]).toMatchObject({ count: 2, estimatedUsd: 0.1 })
  })
})

describe('usageCsv', () => {
  it('writes a BOM, the fixed header and one CRLF row per request in time order', () => {
    const csv = usageCsv([
      row({ createdAt: '2026-11-20T10:00:00.000Z', model: 'b' }),
      row({ createdAt: '2026-11-19T10:00:00.000Z', model: 'a' }),
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(USAGE_CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('2026-11-19')
  })

  it('quotes cells containing commas, quotes or newlines and blanks nulls', () => {
    const csv = usageCsv([
      row({ model: 'weird,model', errorCode: 'E"X', promptId: 'two\nlines', estimatedUsd: null }),
    ])
    const dataLine = csv.slice(1).split('\r\n')[1]
    expect(dataLine).toContain('"weird,model"')
    expect(dataLine).toContain('"E""X"')
    expect(dataLine).toContain('"two\nlines"')
    expect(dataLine).toContain(',,') // estimatedUsd null → empty
  })

  it('never contains prompt text or key material (structural)', () => {
    const csv = usageCsv([row()])
    expect(csv).not.toMatch(/api[_-]?key/i)
    expect(csv).not.toContain('sk-')
  })
})
