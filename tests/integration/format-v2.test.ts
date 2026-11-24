import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { decisionsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import { decisionSchema, type Decision } from '@/schemas/entities'
import {
  applyImport,
  buildDcopilotFile,
  parseDcopilotFile,
  summarizeImport,
  type DcopilotFile,
} from '@/services/backup'
import { createAssumption, deleteAssumption } from '@/services/assumptions'
import { createExperiment } from '@/services/experiments'
import { createProject, deleteProjectCascade } from '@/services/projects'
import { nowIso } from '@/lib/clock'

/**
 * v0.2.3 数据层 v2：文件格式 v1 → v2（decisions）、实验结论字段、悬空引用清理与级联。
 * 这份文件守的是"老备份能进来、新备份能闭环"两个方向，避免后续任务各自发明迁移规则。
 */

beforeEach(async () => {
  await resetDb()
})

const t = '2026-11-25T00:00:00.000Z'

const projectRow = {
  id: 'p-v1',
  name: '老备份项目',
  description: '',
  status: 'active' as const,
  createdAt: t,
  updatedAt: t,
  deletedAt: null,
}

function v1File(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'discovery-copilot',
    formatVersion: 1,
    appVersion: '0.2.2',
    exportedAt: t,
    projects: [projectRow],
    assumptions: [],
    experiments: [],
    ostNodes: [],
    reports: [],
    settings: null,
    ...overrides,
  }
}

async function seedProjectWithDecision(
  decisionPatch: Partial<Decision> = {},
): Promise<{ projectId: string; decision: Decision; assumptionId: string }> {
  const project = await createProject({ name: '决策项目' })
  const assumption = await createAssumption(project.id, {
    statement: '用户愿意为自动对账付费',
    type: 'value',
    impact: 4,
    risk: 4,
    confidence: null,
  })
  const decision = decisionSchema.parse({
    id: crypto.randomUUID(),
    projectId: project.id,
    statement: '先做假门测试，再决定是否开发',
    rationale: '验证成本最低',
    decidedAt: nowIso(),
    linkedAssumptionIds: [assumption.id],
    linkedExperimentIds: [],
    status: 'active',
    supersededAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...decisionPatch,
  })
  await decisionsRepo.put(decision)
  return { projectId: project.id, decision, assumptionId: assumption.id }
}

describe('formatVersion 2 迁移', () => {
  it('v1 文件补空决策表后导入成功，原有四表行数不变', async () => {
    const parsed = parseDcopilotFile(JSON.stringify(v1File()))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.file.formatVersion).toBe(2)
    expect(parsed.file.decisions).toEqual([])

    const result = await applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: false })
    expect(result.created).toBe(1)
    expect(await db.projects.count()).toBe(1)
    expect(await db.decisions.count()).toBe(0)
  })

  it('v0 → v1 → v2 链式迁移仍可用', () => {
    const v0 = v1File({ formatVersion: 0 })
    delete v0.reports
    delete v0.settings
    const parsed = parseDcopilotFile(JSON.stringify(v0))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.file.formatVersion).toBe(2)
      expect(parsed.file.decisions).toEqual([])
    }
  })

  it('formatVersion 3 明确拒绝且不写库', () => {
    const parsed = parseDcopilotFile(JSON.stringify(v1File({ formatVersion: 3 })))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.issues.join()).toContain('升级')
    expect(db.isOpen()).toBe(true)
  })
})

describe('决策日志 round-trip', () => {
  it('导出后清库再导入，字段逐项相等（含 superseded）', async () => {
    const project = await createProject({ name: '往返项目' })
    const assumption = await createAssumption(project.id, {
      statement: '订阅制能提升复购',
      type: 'value',
      impact: 3,
      risk: 3,
      confidence: null,
    })
    const experiment = await createExperiment(project.id, {
      assumptionId: assumption.id,
      hypothesis: '若提供订阅，则 30 天内复购率 ≥ 30%',
      method: '试点',
      successCriteria: '复购率 ≥ 30%',
      status: 'completed',
      result: '复购率 35%',
      outcome: 'supported',
      metric: '30 天复购率',
      actualValue: '35%',
    })
    const decision = decisionSchema.parse({
      id: crypto.randomUUID(),
      projectId: project.id,
      statement: '保留订阅模式，砍掉单次购买',
      rationale: '复购率达标',
      decidedAt: nowIso(),
      linkedAssumptionIds: [assumption.id],
      linkedExperimentIds: [experiment.id],
      status: 'superseded',
      supersededAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })
    await decisionsRepo.put(decision)

    const file = await buildDcopilotFile('all')
    expect(file.formatVersion).toBe(2)
    const text = JSON.stringify(file)
    await resetDb()

    const parsed = parseDcopilotFile(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await applyImport(parsed.file, { conflictStrategy: 'copy', restoreSettings: false })

    const rows = await db.decisions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(decision)
    const importedExperiment = (await db.experiments.toArray())[0]!
    expect(importedExperiment.outcome).toBe('supported')
    expect(importedExperiment.metric).toBe('30 天复购率')
    expect(importedExperiment.actualValue).toBe('35%')
  })
})

describe('悬空引用清理', () => {
  it('过滤不存在的假设与跨项目实验引用，决策本体保留并计数', async () => {
    const file: DcopilotFile = {
      format: 'discovery-copilot',
      formatVersion: 2,
      appVersion: '0.2.3',
      exportedAt: t,
      projects: [projectRow, { ...projectRow, id: 'p-other', name: '另一个项目' }],
      assumptions: [
        {
          id: 'a-1',
          projectId: projectRow.id,
          type: 'value',
          statement: '只在文件里的假设',
          impact: 3,
          risk: 3,
          confidence: null,
          priorityScore: 9,
          status: 'open',
          createdAt: t,
          updatedAt: t,
        },
      ],
      experiments: [
        {
          id: 'e-other',
          projectId: 'p-other',
          assumptionId: null,
          hypothesis: '别的项目的实验',
          method: 'smoke',
          successCriteria: null,
          status: 'planned',
          result: null,
          outcome: null,
          metric: '',
          actualValue: '',
          createdAt: t,
          updatedAt: t,
        },
      ],
      ostNodes: [],
      reports: [],
      decisions: [
        {
          id: 'd-1',
          projectId: projectRow.id,
          statement: '引用部分失效也要保留',
          rationale: '',
          decidedAt: t,
          linkedAssumptionIds: ['a-1', 'a-ghost'],
          linkedExperimentIds: ['e-ghost', 'e-other'],
          status: 'active',
          supersededAt: null,
          createdAt: t,
          updatedAt: t,
        },
      ],
      settings: null,
    }

    const summary = await summarizeImport(file)
    expect(summary.cleanedReferences).toBe(3)
    expect(summary.totals.decisions).toBe(1)

    await applyImport(file, { conflictStrategy: 'copy', restoreSettings: false })
    const rows = await db.decisions.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.linkedAssumptionIds).toEqual(['a-1'])
    expect(rows[0]!.linkedExperimentIds).toEqual([])
  })
})

describe('级联与引用清理', () => {
  it('删除项目时决策一并清除', async () => {
    const { projectId } = await seedProjectWithDecision()
    await deleteProjectCascade(projectId)
    expect(await db.decisions.count()).toBe(0)
  })

  it('删除假设只摘掉链接，决策仍保留', async () => {
    const { decision, assumptionId } = await seedProjectWithDecision()
    await deleteAssumption(assumptionId)
    const row = await db.decisions.get(decision.id)
    expect(row).toBeTruthy()
    expect(row!.linkedAssumptionIds).toEqual([])
    expect(row!.updatedAt >= decision.updatedAt).toBe(true)
  })
})

describe('容量常量', () => {
  it('CAPS.decisions 固定为 200', () => {
    expect(CAPS.decisions).toBe(200)
  })
})
