import { db } from '@/db/db'
import { assumptionsRepo, decisionsRepo, experimentsRepo, projectsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS } from '@/lib/limits'
import { decisionSchema, type Decision } from '@/schemas/entities'

/**
 * 决策日志服务（v0.2.3-C）：只追加、可标注被推翻，不提供编辑/删除。
 * 关联的假设/实验可能已被删除，因此创建时静默过滤无效 id——一条决策
 * 不应因为引用失效而无法记录。
 */

export interface DecisionInput {
  statement: string
  rationale?: string
  linkedAssumptionIds?: string[]
  linkedExperimentIds?: string[]
}

function normalize(row: Decision): Decision {
  try {
    return decisionSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `决策数据损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

/** active 在前，其余按 decidedAt 倒序（同组）。 */
export async function listDecisionsByProject(projectId: string): Promise<Decision[]> {
  const rows = await decisionsRepo.byProject(projectId)
  return rows.map(normalize).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return b.decidedAt.localeCompare(a.decidedAt)
  })
}

async function filterSameProjectAssumptions(projectId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  const rows = await Promise.all(unique.map((id) => assumptionsRepo.get(id)))
  return rows.flatMap((row) => (row && row.projectId === projectId ? [row.id] : []))
}

async function filterSameProjectExperiments(projectId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)]
  const rows = await Promise.all(unique.map((id) => experimentsRepo.get(id)))
  return rows.flatMap((row) => (row && row.projectId === projectId ? [row.id] : []))
}

export async function createDecision(projectId: string, input: DecisionInput): Promise<Decision> {
  return db.transaction(
    'rw',
    [db.projects, db.assumptions, db.experiments, db.decisions],
    async () => {
      const project = await projectsRepo.get(projectId)
      if (!project || project.deletedAt) {
        throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
      }
      if ((await decisionsRepo.countByProject(projectId)) >= CAPS.decisions) {
        throw new DomainError('CAPACITY_LIMIT', `单项目决策日志已达上限 ${CAPS.decisions}`)
      }
      const linkedAssumptionIds = await filterSameProjectAssumptions(
        projectId,
        input.linkedAssumptionIds ?? [],
      )
      const linkedExperimentIds = await filterSameProjectExperiments(
        projectId,
        input.linkedExperimentIds ?? [],
      )
      const ts = nowIso()
      const row = decisionSchema.parse({
        id: crypto.randomUUID(),
        projectId,
        statement: input.statement,
        rationale: input.rationale ?? '',
        decidedAt: ts,
        linkedAssumptionIds,
        linkedExperimentIds,
        status: 'active',
        supersededAt: null,
        createdAt: ts,
        updatedAt: ts,
      })
      await decisionsRepo.put(row)
      return row
    },
  )
}

/** 只允许 active → superseded；已推翻时原样返回（时间不变，幂等）。 */
export async function supersedeDecision(id: string): Promise<Decision> {
  return db.transaction('rw', [db.decisions], async () => {
    const raw = await decisionsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `决策不存在: ${id}`)
    const current = normalize(raw)
    if (current.status === 'superseded') return current
    const ts = nowIso()
    const row = decisionSchema.parse({
      ...current,
      status: 'superseded',
      supersededAt: ts,
      updatedAt: ts,
    })
    await decisionsRepo.put(row)
    return row
  })
}
