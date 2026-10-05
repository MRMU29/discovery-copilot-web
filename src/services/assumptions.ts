import type { z } from 'zod'
import { db } from '@/db/db'
import { assumptionsRepo, ostRepo, projectsRepo, scoreEventsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS } from '@/lib/limits'
import { computePriorityScore } from '@/lib/priority'
import { assumptionSchema, type Assumption } from '@/schemas/entities'

type AssumptionInput = Omit<
  z.input<typeof assumptionSchema>,
  'id' | 'projectId' | 'priorityScore' | 'createdAt' | 'updatedAt'
>
type AssumptionPatch = Partial<
  Omit<z.input<typeof assumptionSchema>, 'id' | 'projectId' | 'priorityScore' | 'createdAt'>
>

export type ScoreChangeActor = 'user' | 'ai-suggestion'

const snapshotOf = (a: Assumption) => ({
  impact: a.impact,
  risk: a.risk,
  confidence: a.confidence,
  priorityScore: a.priorityScore,
})

/** Read path: zod defaults normalize legacy rows (missing confidence/status/priorityScore). */
function normalize(row: Assumption): Assumption {
  try {
    return assumptionSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `假设数据损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

export async function createAssumption(
  projectId: string,
  input: AssumptionInput,
  opts: { changedBy?: ScoreChangeActor } = {},
): Promise<Assumption> {
  return db.transaction('rw', [db.projects, db.assumptions, db.score_events], async () => {
    const project = await projectsRepo.get(projectId)
    if (!project || project.deletedAt) {
      throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
    }
    const count = await assumptionsRepo.countByProject(projectId)
    if (count >= CAPS.assumptions) {
      throw new DomainError('CAPACITY_LIMIT', `单项目假设数已达上限 ${CAPS.assumptions}`)
    }
    const ts = nowIso()
    const base = assumptionSchema
      .omit({ priorityScore: true })
      .parse({ ...input, id: crypto.randomUUID(), projectId, createdAt: ts, updatedAt: ts })
    const row = assumptionSchema.parse({ ...base, priorityScore: computePriorityScore(base) })
    await assumptionsRepo.put(row)
    await scoreEventsRepo.add({
      assumptionId: row.id,
      projectId,
      changedBy: opts.changedBy ?? 'user',
      changedAt: ts,
      before: null,
      after: snapshotOf(row),
    })
    return row
  })
}

export async function updateAssumption(
  id: string,
  patch: AssumptionPatch,
  opts: { changedBy?: ScoreChangeActor } = {},
): Promise<Assumption> {
  return db.transaction('rw', [db.assumptions, db.score_events], async () => {
    const raw = await assumptionsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `假设不存在: ${id}`)
    const current = normalize(raw)
    const ts = nowIso()
    const base = assumptionSchema.omit({ priorityScore: true }).parse({ ...current, ...patch, updatedAt: ts })
    const scoreChanged =
      base.impact !== current.impact ||
      base.risk !== current.risk ||
      base.confidence !== current.confidence
    const row = assumptionSchema.parse({
      ...base,
      priorityScore: scoreChanged ? computePriorityScore(base) : current.priorityScore,
    })
    await assumptionsRepo.put(row)
    if (scoreChanged) {
      await scoreEventsRepo.add({
        assumptionId: id,
        projectId: row.projectId,
        changedBy: opts.changedBy ?? 'user',
        changedAt: ts,
        before: snapshotOf(current),
        after: snapshotOf(row),
      })
    }
    return row
  })
}

export async function getAssumption(id: string): Promise<Assumption> {
  const raw = await assumptionsRepo.get(id)
  if (!raw) throw new DomainError('NOT_FOUND', `假设不存在: ${id}`)
  return normalize(raw)
}

/** Highest score first; ties break by recency. */
export async function listAssumptionsByProject(projectId: string): Promise<Assumption[]> {
  const rows = await assumptionsRepo.byProject(projectId)
  return rows
    .map(normalize)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.updatedAt.localeCompare(a.updatedAt))
}

/** Deletes an assumption plus its audit trail, and unlinks dependents (experiments, OST). */
export async function deleteAssumption(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.assumptions, db.score_events, db.experiments, db.ost_nodes],
    async () => {
      const raw = await assumptionsRepo.get(id)
      if (!raw) throw new DomainError('NOT_FOUND', `假设不存在: ${id}`)
      await assumptionsRepo.delete(id)
      await scoreEventsRepo.deleteByAssumption(id)
      await assumptionsRepo.unlinkAssumption(id)
      await ostRepo.unlinkAssumption(id)
    },
  )
}
