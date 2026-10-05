import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { scoreEventsRepo } from '@/db/repositories'
import { loadSampleProject } from '@/services/sample-project'

beforeEach(async () => {
  await resetDb()
})

describe('loadSampleProject (command 7)', () => {
  it('seeds one project with the full demo dataset through the real write path', async () => {
    const refs = await loadSampleProject()
    const pid = refs.project.id

    expect(refs.project.name).toContain('宠物鲜食外卖')
    expect(await db.projects.count()).toBe(1)
    expect(await db.assumptions.where('projectId').equals(pid).count()).toBe(8)
    expect(await db.experiments.where('projectId').equals(pid).count()).toBe(3)
    expect(await db.ost_nodes.where('projectId').equals(pid).count()).toBe(8)
    expect(await db.reports.where('projectId').equals(pid).count()).toBe(1)
  })

  it('computes priority scores via the service (impact × risk × (1 − confidence))', async () => {
    const refs = await loadSampleProject()
    const rows = await db.assumptions.where('projectId').equals(refs.project.id).toArray()
    const byId = new Map(rows.map((r) => [r.id, r]))

    const top = byId.get(refs.assumptionIds['value-willingness'])!
    expect(top.priorityScore).toBe(20) // 5 × 4 × (1 − 0)
    const partial = byId.get(refs.assumptionIds['usability-first-order'])!
    expect(partial.priorityScore).toBeCloseTo(11.2) // 4 × 4 × (1 − 0.3)

    // Audit trail exists for demo data (changedBy 'user', creation event).
    const events = await scoreEventsRepo.byAssumption(top.id)
    expect(events).toHaveLength(1)
    expect(events[0].changedBy).toBe('user')
    expect(events[0].before).toBeNull()
  })

  it('wires experiment and OST links to real ids', async () => {
    const refs = await loadSampleProject()
    const pid = refs.project.id

    const fakeDoor = (await db.experiments.get(refs.experimentIds['exp-fake-door']))!
    expect(fakeDoor.assumptionId).toBe(refs.assumptionIds['value-willingness'])
    expect(fakeDoor.status).toBe('planned')

    const completed = (await db.experiments.get(refs.experimentIds['exp-prototype-order']))!
    expect(completed.status).toBe('completed')
    expect(completed.result).toContain('83%')

    const nodes = await db.ost_nodes.where('projectId').equals(pid).toArray()
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const outcome = nodes.find((n) => n.type === 'outcome')!
    expect(outcome.parentId).toBeNull()

    // Chain integrity: every non-root parent exists with the required type.
    const required = { opportunity: 'outcome', solution: 'opportunity', experiment: 'solution' }
    for (const n of nodes) {
      if (n.parentId) {
        const parent = byId.get(n.parentId)!
        expect(parent.type).toBe(required[n.type as keyof typeof required])
      }
    }

    // The two OST experiment nodes link to seeded experiments.
    const expNodes = nodes.filter((n) => n.type === 'experiment')
    expect(expNodes).toHaveLength(2)
    for (const n of expNodes) {
      expect(n.linkedExperimentId != null).toBe(true)
      expect(Object.values(refs.experimentIds)).toContain(n.linkedExperimentId)
    }
  })

  it('can load the sample twice — independent copies coexist', async () => {
    await loadSampleProject()
    const second = await loadSampleProject()
    expect(await db.projects.count()).toBe(2)
    expect(await db.assumptions.where('projectId').equals(second.project.id).count()).toBe(8)
  })
})
