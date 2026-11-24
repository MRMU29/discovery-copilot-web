import { describe, expect, it } from 'vitest'
import type { Experiment } from '@/schemas/entities'
import {
  BOARD_COLUMNS,
  OUTCOME_META,
  groupByStatus,
  pendingResultCount,
  type ExperimentOutcome,
} from '@/pages/project/experiments/experiment-meta'
import { zhHans } from '@/lib/i18n/dictionaries/zh-Hans'

function experiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp-1',
    projectId: 'proj-1',
    assumptionId: null,
    hypothesis: '若提供一键导入模板，则首次导入时间减半',
    method: '假门测试',
    successCriteria: null,
    status: 'planned',
    result: null,
    outcome: null,
    metric: '',
    actualValue: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('groupByStatus', () => {
  it('always returns all four columns, even when empty', () => {
    const groups = groupByStatus([])
    expect(Object.keys(groups).sort()).toEqual(['completed', 'dropped', 'planned', 'running'])
    for (const status of BOARD_COLUMNS) expect(groups[status]).toEqual([])
  })

  it('keeps input order inside a column', () => {
    const a = experiment({ id: 'a' })
    const b = experiment({ id: 'b' })
    const c = experiment({ id: 'c', status: 'running' })
    const groups = groupByStatus([a, c, b])
    expect(groups.planned.map((e) => e.id)).toEqual(['a', 'b'])
    expect(groups.running.map((e) => e.id)).toEqual(['c'])
  })

  it('files unknown statuses under planned instead of dropping them', () => {
    const weird = experiment({ id: 'weird', status: 'legacy' as Experiment['status'] })
    const groups = groupByStatus([weird])
    expect(groups.planned.map((e) => e.id)).toEqual(['weird'])
    expect(groups.running).toEqual([])
  })
})

describe('pendingResultCount', () => {
  it('counts only completed experiments without a result or outcome', () => {
    const items = [
      experiment({ id: 'done-empty', status: 'completed' }),
      experiment({ id: 'done-result', status: 'completed', result: '有效' }),
      experiment({ id: 'done-outcome', status: 'completed', outcome: 'supported' }),
      experiment({ id: 'running', status: 'running' }),
      experiment({ id: 'blank-result', status: 'completed', result: '   ' }),
    ]
    expect(pendingResultCount(items)).toBe(2)
  })

  it('treats whitespace-only results as missing', () => {
    expect(pendingResultCount([experiment({ status: 'completed', result: '\n  ' })])).toBe(1)
  })
})

describe('OUTCOME_META', () => {
  it('covers every outcome and every label key exists in zh-Hans', () => {
    const outcomes = Object.keys(OUTCOME_META) as ExperimentOutcome[]
    expect(outcomes.sort()).toEqual(['inconclusive', 'refuted', 'supported'])
    for (const outcome of outcomes) {
      const key = OUTCOME_META[outcome].labelKey
      expect((zhHans as Record<string, string>)[key], key).toBeTruthy()
    }
  })
})
