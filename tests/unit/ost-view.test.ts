import { describe, expect, it } from 'vitest'
import type { OstNode } from '@/schemas/entities'
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  descendantIds,
  ostTableRows,
  requiredParentType,
  visibleNodes,
} from '@/pages/project/ost/ost-meta'

function node(partial: Partial<OstNode> & { id: string; type: OstNode['type'] }): OstNode {
  return {
    id: partial.id,
    projectId: 'p1',
    type: partial.type,
    parentId: partial.parentId ?? null,
    title: partial.title ?? `节点 ${partial.id}`,
    position: partial.position ?? { x: 0, y: 0 },
    linkedAssumptionId: partial.linkedAssumptionId ?? null,
    linkedExperimentId: partial.linkedExperimentId ?? null,
    createdAt: '2026-10-03T00:00:00.000Z',
  }
}

describe('requiredParentType', () => {
  it('maps the §5.3 chain and roots outcome', () => {
    expect(requiredParentType('outcome')).toBeNull()
    expect(requiredParentType('opportunity')).toBe('outcome')
    expect(requiredParentType('solution')).toBe('opportunity')
    expect(requiredParentType('experiment')).toBe('solution')
  })
})

describe('visibleNodes (§5.4 viewport culling)', () => {
  const nodes = [
    node({ id: 'inside', type: 'outcome', position: { x: 100, y: 100 } }),
    node({ id: 'partial', type: 'outcome', position: { x: 190, y: 190 } }),
    node({ id: 'outside', type: 'outcome', position: { x: 5000, y: 5000 } }),
  ]

  it('keeps nodes intersecting the visible rect (with node box size)', () => {
    const visible = visibleNodes(nodes, { x: 0, y: 0, width: 300, height: 300 })
    expect(visible.has('inside')).toBe(true)
    // partial overlaps at x=190 with width NODE_WIDTH=220 → intersects
    expect(visible.has('partial')).toBe(true)
    expect(visible.has('outside')).toBe(false)
  })

  it('culls everything outside the rect', () => {
    const visible = visibleNodes(nodes, { x: 4000, y: 4000, width: 100, height: 100 })
    expect(visible.size).toBe(0)
  })

  it('uses the declared node box size for intersections', () => {
    expect(NODE_WIDTH).toBeGreaterThan(0)
    expect(NODE_HEIGHT).toBeGreaterThan(0)
    // Node box starts 1px inside the rect's right/bottom edge → still intersects.
    const touching = visibleNodes(
      [node({ id: 'edge', type: 'solution', position: { x: NODE_WIDTH - 1, y: NODE_HEIGHT - 1 } })],
      { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
    )
    expect(touching.has('edge')).toBe(true)
    const justOutside = visibleNodes(
      [node({ id: 'off', type: 'solution', position: { x: NODE_WIDTH + 1, y: NODE_HEIGHT + 1 } })],
      { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
    )
    expect(justOutside.has('off')).toBe(false)
  })
})

describe('descendantIds', () => {
  const tree = [
    node({ id: 'root', type: 'outcome' }),
    node({ id: 'opp1', type: 'opportunity', parentId: 'root' }),
    node({ id: 'opp2', type: 'opportunity', parentId: 'root' }),
    node({ id: 'sol1', type: 'solution', parentId: 'opp1' }),
    node({ id: 'exp1', type: 'experiment', parentId: 'sol1' }),
  ]

  it('collects the whole subtree (BFS)', () => {
    const doomed = descendantIds(tree, 'root')
    expect(doomed).toEqual(new Set(['opp1', 'opp2', 'sol1', 'exp1']))
  })

  it('returns an empty set for a leaf', () => {
    expect(descendantIds(tree, 'exp1').size).toBe(0)
  })
})

describe('ostTableRows (§8.5 equivalent table view)', () => {
  const nodes = [
    node({ id: 'sol', type: 'solution', parentId: 'opp', title: '每周订阅菜单' }),
    node({ id: 'opp', type: 'opportunity', parentId: 'root', title: '被制作时间劝退', linkedAssumptionId: 'a1' }),
    node({ id: 'root', type: 'outcome', title: '验证订阅需求', position: { x: 110, y: 40 } }),
  ]
  const assumptions = [
    { id: 'a1', projectId: 'p1', type: 'value', statement: '用户愿意付费', impact: 4, risk: 4, confidence: null, priorityScore: 16, status: 'open', createdAt: '', updatedAt: '' },
  ] as never[]
  const experiments = [] as never[]

  it('joins parent/assumption titles and reports positions', () => {
    const rows = ostTableRows(nodes, assumptions, experiments)
    const opp = rows.find((r) => r.id === 'opp')!
    expect(opp.parentTitle).toBe('验证订阅需求')
    expect(opp.assumptionTitle).toBe('用户愿意付费')
    expect(opp.experimentTitle).toBe('—')
    const root = rows.find((r) => r.id === 'root')!
    expect(root.parentTitle).toBe('—')
    expect(root.x).toBe(110)
  })
})
