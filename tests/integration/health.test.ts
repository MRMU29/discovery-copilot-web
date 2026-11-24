import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/db/db'
import { CAPS } from '@/lib/limits'
import {
  assumptionSchema,
  decisionSchema,
  ostNodeSchema,
} from '@/schemas/entities'
import type { HealthIssue } from '@/services/health'
import { repairHealthIssue, scanDataHealth } from '@/services/health'
import * as assumptions from '@/services/assumptions'
import * as experiments from '@/services/experiments'
import * as projects from '@/services/projects'

const TS = '2026-11-25T00:00:00.000Z'

beforeEach(async () => {
  await resetDb()
})

async function snapshotTables() {
  const [p, a, e, o, r, d] = await Promise.all([
    db.projects.toArray(),
    db.assumptions.toArray(),
    db.experiments.toArray(),
    db.ost_nodes.toArray(),
    db.reports.toArray(),
    db.decisions.toArray(),
  ])
  return JSON.stringify({ p, a, e, o, r, d })
}

describe('scanDataHealth', () => {
  it('reports nothing on a clean database and counts every table', async () => {
    const project = await projects.createProject({ name: '干净项目' })
    await assumptions.createAssumption(project.id, {
      type: 'value',
      statement: '用户愿意付费',
      impact: 4,
      risk: 3,
    })

    const report = await scanDataHealth()
    expect(report.issues).toEqual([])
    expect(report.counts.projects).toBe(1)
    expect(report.counts.assumptions).toBe(1)
    expect(report.counts.decisions).toBe(0)
  })

  it('is strictly read-only', async () => {
    const project = await projects.createProject({ name: '只读验证' })
    await db.assumptions.put(
      assumptionSchema.parse({
        id: 'orphan-a',
        projectId: 'ghost-project',
        type: 'value',
        statement: '孤儿假设',
        impact: 3,
        risk: 3,
        priorityScore: 9,
        createdAt: TS,
        updatedAt: TS,
      }),
    )
    const before = await snapshotTables()
    await scanDataHealth()
    expect(await snapshotTables()).toBe(before)
    expect(project.id).toBeTruthy()
  })

  it('finds an orphan row and repairs only that row', async () => {
    const project = await projects.createProject({ name: '孤儿修复' })
    const keep = await assumptions.createAssumption(project.id, {
      type: 'value',
      statement: '保留的假设',
      impact: 3,
      risk: 3,
    })
    await db.assumptions.put(
      assumptionSchema.parse({
        id: 'orphan-1',
        projectId: 'ghost-project',
        type: 'value',
        statement: '没有项目的假设',
        impact: 3,
        risk: 3,
        priorityScore: 9,
        createdAt: TS,
        updatedAt: TS,
      }),
    )

    const report = await scanDataHealth()
    const issue = report.issues.find((i) => i.kind === 'orphan' && i.entityId === 'orphan-1')
    expect(issue).toBeTruthy()
    expect(issue?.table).toBe('assumptions')

    await repairHealthIssue(issue as HealthIssue)
    expect(await db.assumptions.get('orphan-1')).toBeUndefined()
    expect(await db.assumptions.get(keep.id)).toBeTruthy()
  })

  it('does not treat recycle-bin projects as orphans', async () => {
    const project = await projects.createProject({ name: '回收站父级' })
    await assumptions.createAssumption(project.id, {
      type: 'value',
      statement: '回收站项目下的假设',
      impact: 3,
      risk: 3,
    })
    await projects.softDeleteProject(project.id)

    const report = await scanDataHealth()
    expect(report.issues.filter((i) => i.kind === 'orphan')).toEqual([])
  })

  it('finds a broken experiment link and clears the link without deleting the row', async () => {
    const project = await projects.createProject({ name: '断链项目' })
    const assumption = await assumptions.createAssumption(project.id, {
      type: 'value',
      statement: '会被直接删掉的假设',
      impact: 3,
      risk: 3,
    })
    const experiment = await experiments.createExperiment(project.id, {
      hypothesis: '若这样则那样',
      method: '假门测试',
      assumptionId: assumption.id,
    })
    // Bypass the service so the link is left dangling, like a partial write would.
    await db.assumptions.delete(assumption.id)

    const report = await scanDataHealth()
    const issue = report.issues.find((i) => i.kind === 'broken-link' && i.table === 'experiments')
    expect(issue?.entityId).toBe(experiment.id)
    expect(issue?.detail?.field).toBe('assumptionId')

    await repairHealthIssue(issue as HealthIssue)
    const repaired = await db.experiments.get(experiment.id)
    expect(repaired).toBeTruthy()
    expect(repaired?.assumptionId).toBeNull()
  })

  it('clears a dangling decision reference but keeps the decision', async () => {
    const project = await projects.createProject({ name: '决策断链' })
    await db.decisions.put(
      decisionSchema.parse({
        id: 'decision-1',
        projectId: project.id,
        statement: '先做假门测试',
        rationale: '依据一条已经不存在的假设',
        decidedAt: TS,
        linkedAssumptionIds: ['ghost-assumption'],
        linkedExperimentIds: [],
        status: 'active',
        supersededAt: null,
        createdAt: TS,
        updatedAt: TS,
      }),
    )

    const report = await scanDataHealth()
    const issue = report.issues.find((i) => i.kind === 'broken-link' && i.table === 'decisions')
    expect(issue?.detail).toMatchObject({ field: 'linkedAssumptionIds', refId: 'ghost-assumption' })

    await repairHealthIssue(issue as HealthIssue)
    const repaired = await db.decisions.get('decision-1')
    expect(repaired?.linkedAssumptionIds).toEqual([])
    expect(repaired?.statement).toBe('先做假门测试')
  })

  it('reports one issue per OST cycle and breaks the loop on repair', async () => {
    const project = await projects.createProject({ name: '成环项目' })
    const node = (id: string, parentId: string | null) =>
      ostNodeSchema.parse({
        id,
        projectId: project.id,
        type: 'opportunity',
        parentId,
        title: id,
        position: { x: 0, y: 0 },
        linkedAssumptionId: null,
        linkedExperimentId: null,
        createdAt: TS,
      })
    await db.ost_nodes.bulkPut([node('n1', 'n2'), node('n2', 'n1')])

    const report = await scanDataHealth()
    const cycles = report.issues.filter((i) => i.kind === 'cycle')
    expect(cycles).toHaveLength(1)

    await repairHealthIssue(cycles[0])
    const after = await scanDataHealth()
    expect(after.issues.filter((i) => i.kind === 'cycle')).toEqual([])
    expect(await db.ost_nodes.count()).toBe(2)
  })

  it('reports over-capacity without offering a repair', async () => {
    const project = await projects.createProject({ name: '超容量项目' })
    const rows = Array.from({ length: CAPS.assumptions + 1 }, (_, i) =>
      assumptionSchema.parse({
        id: `cap-${i}`,
        projectId: project.id,
        type: 'value',
        statement: `第 ${i} 条`,
        impact: 3,
        risk: 3,
        priorityScore: 9,
        createdAt: TS,
        updatedAt: TS,
      }),
    )
    await db.assumptions.bulkPut(rows)

    const report = await scanDataHealth()
    const issue = report.issues.find((i) => i.kind === 'over-capacity' && i.table === 'assumptions')
    expect(issue?.detail).toMatchObject({ count: CAPS.assumptions + 1, limit: CAPS.assumptions })

    await expect(repairHealthIssue(issue as HealthIssue)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await db.assumptions.count()).toBe(CAPS.assumptions + 1)
  })

  it('leaves a valid same-project experiment link alone', async () => {
    const project = await projects.createProject({ name: '正常引用' })
    const assumption = await assumptions.createAssumption(project.id, {
      type: 'value',
      statement: '正常假设',
      impact: 3,
      risk: 3,
    })
    await experiments.createExperiment(project.id, {
      hypothesis: '正常实验',
      method: '访谈',
      assumptionId: assumption.id,
    })
    const report = await scanDataHealth()
    expect(report.issues).toEqual([])
  })
})

describe('repairHealthIssue guards', () => {
  it('rejects a broken-link repair without a field', async () => {
    await expect(
      repairHealthIssue({
        kind: 'broken-link',
        table: 'experiments',
        entityId: 'whatever',
        projectId: 'p',
        label: 'x',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('rejects an unknown issue kind', async () => {
    await expect(
      repairHealthIssue({
        kind: 'mystery' as HealthIssue['kind'],
        table: 'experiments',
        entityId: 'whatever',
        projectId: 'p',
        label: 'x',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
