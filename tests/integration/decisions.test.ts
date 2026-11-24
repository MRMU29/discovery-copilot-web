import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { decisionsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import { decisionSchema } from '@/schemas/entities'
import { createAssumption } from '@/services/assumptions'
import { createDecision, listDecisionsByProject, supersedeDecision } from '@/services/decisions'
import { createExperiment } from '@/services/experiments'
import { createProject, deleteProjectCascade } from '@/services/projects'

/**
 * 决策日志服务：只追加、可标注被推翻、引用静默过滤、容量与级联。
 * 不测 UI —— 页面行为由构建期类型与 i18n 使用门禁兜底。
 */

beforeEach(async () => {
  await resetDb()
})

async function seed(): Promise<{ projectId: string; assumptionId: string }> {
  const project = await createProject({ name: '决策项目' })
  const assumption = await createAssumption(project.id, {
    statement: '用户愿意为自动对账付费',
    type: 'value',
    impact: 4,
    risk: 4,
    confidence: null,
  })
  return { projectId: project.id, assumptionId: assumption.id }
}

describe('createDecision', () => {
  it('写入齐全字段，status=active，decidedAt 是合法 ISO', async () => {
    const { projectId, assumptionId } = await seed()
    const row = await createDecision(projectId, {
      statement: '先做假门测试，再决定是否开发',
      rationale: '验证成本最低',
      linkedAssumptionIds: [assumptionId],
    })
    expect(row.status).toBe('active')
    expect(row.supersededAt).toBeNull()
    expect(row.linkedAssumptionIds).toEqual([assumptionId])
    expect(Number.isNaN(Date.parse(row.decidedAt))).toBe(false)
    expect(row.decidedAt).toBe(row.createdAt)
    expect(await decisionsRepo.countByProject(projectId)).toBe(1)
  })

  it('静默过滤跨项目与不存在的关联 id，决策仍然创建成功', async () => {
    const a = await seed()
    const other = await createProject({ name: '另一个项目' })
    const otherAssumption = await createAssumption(other.id, {
      statement: '别的项目的假设',
      type: 'value',
      impact: 2,
      risk: 2,
      confidence: null,
    })
    const otherExperiment = await createExperiment(other.id, {
      hypothesis: '别的项目的实验',
      method: 'smoke',
      successCriteria: null,
      assumptionId: otherAssumption.id,
    })

    const row = await createDecision(a.projectId, {
      statement: '只保留本项目引用',
      linkedAssumptionIds: [a.assumptionId, otherAssumption.id, 'ghost-assumption'],
      linkedExperimentIds: ['ghost-experiment', otherExperiment.id],
    })

    expect(row.linkedAssumptionIds).toEqual([a.assumptionId])
    expect(row.linkedExperimentIds).toEqual([])
  })

  it('第 201 条抛 CAPACITY_LIMIT', async () => {
    const { projectId } = await seed()
    for (let i = 0; i < CAPS.decisions; i++) {
      await createDecision(projectId, { statement: `决策 ${i}` })
    }
    await expect(createDecision(projectId, { statement: '溢出' })).rejects.toMatchObject({
      code: 'CAPACITY_LIMIT',
    })
  })
})

describe('supersedeDecision', () => {
  it('置 status + supersededAt，重复调用幂等', async () => {
    const { projectId } = await seed()
    const created = await createDecision(projectId, { statement: '旧方向' })

    const superseded = await supersedeDecision(created.id)
    expect(superseded.status).toBe('superseded')
    expect(superseded.supersededAt).not.toBeNull()

    const again = await supersedeDecision(created.id)
    expect(again.supersededAt).toBe(superseded.supersededAt)
    expect(again.updatedAt).toBe(superseded.updatedAt)
  })
})

describe('listDecisionsByProject', () => {
  it('active 在前，组内按 decidedAt 倒序', async () => {
    const { projectId } = await seed()
    const mk = (id: string, decidedAt: string, status: 'active' | 'superseded') =>
      decisionsRepo.put(
        decisionSchema.parse({
          id,
          projectId,
          statement: id,
          rationale: '',
          decidedAt,
          linkedAssumptionIds: [],
          linkedExperimentIds: [],
          status,
          supersededAt: status === 'superseded' ? decidedAt : null,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        }),
      )
    await mk('d-old', '2026-11-01T00:00:00.000Z', 'active')
    await mk('d-new', '2026-11-05T00:00:00.000Z', 'active')
    await mk('d-sup', '2026-11-09T00:00:00.000Z', 'superseded')

    const rows = await listDecisionsByProject(projectId)
    expect(rows.map((r) => r.id)).toEqual(['d-new', 'd-old', 'd-sup'])
  })
})

describe('级联', () => {
  it('删除项目后 decisions 归零', async () => {
    const { projectId } = await seed()
    await createDecision(projectId, { statement: '会被级联清掉' })
    await deleteProjectCascade(projectId)
    expect(await db.decisions.count()).toBe(0)
  })
})
