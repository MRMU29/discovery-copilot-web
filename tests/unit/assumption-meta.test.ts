import { describe, expect, it } from 'vitest'
import {
  ASSUMPTION_TYPE_META,
  QUADRANT_META,
  STATUS_META,
  quadrantOf,
} from '@/lib/assumption-meta'
import { ASSUMPTION_TYPES } from '@/schemas/entities'

describe('assumption display metadata', () => {
  it('covers all 8 risk categories with a label and tint badge', () => {
    expect(Object.keys(ASSUMPTION_TYPE_META)).toHaveLength(8)
    for (const type of ASSUMPTION_TYPES) {
      expect(ASSUMPTION_TYPE_META[type].labelKey.length).toBeGreaterThan(0)
      expect(ASSUMPTION_TYPE_META[type].badgeClass).toContain('bg-tint-')
    }
  })

  it('covers all 5 statuses', () => {
    expect(Object.keys(STATUS_META)).toHaveLength(5)
  })

  it('labels all four quadrants', () => {
    expect(Object.keys(QUADRANT_META)).toHaveLength(4)
  })
})

describe('quadrantOf — ≥4 counts as high on the 1–5 scale', () => {
  it('high impact × high risk → experiment', () => {
    expect(quadrantOf(4, 4)).toBe('experiment')
    expect(quadrantOf(5, 5)).toBe('experiment')
  })

  it('high impact × low risk → implement', () => {
    expect(quadrantOf(4, 3)).toBe('implement')
    expect(quadrantOf(5, 1)).toBe('implement')
  })

  it('low impact × high risk → reject', () => {
    expect(quadrantOf(3, 4)).toBe('reject')
    expect(quadrantOf(1, 5)).toBe('reject')
  })

  it('low × low → defer', () => {
    expect(quadrantOf(3, 3)).toBe('defer')
    expect(quadrantOf(1, 1)).toBe('defer')
  })
})
