import type { z } from 'zod'
import { db } from '@/db/db'
import { assumptionsRepo, experimentsRepo, ostRepo, projectsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS } from '@/lib/limits'
import { experimentSchema, type Experiment } from '@/schemas/entities'

type ExperimentInput = Omit<
  z.input<typeof experimentSchema>,
  'id' | 'projectId' | 'createdAt' | 'updatedAt'
>
type ExperimentPatch = Partial<
  Omit<z.input<typeof experimentSchema>, 'id' | 'projectId' | 'createdAt'>
>

function normalize(row: Experiment): Experiment {
  try {
    return experimentSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `实验数据损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

/** Referential integrity: a linked assumption must exist and belong to the same project. */
async function assertAssumptionLink(projectId: string, assumptionId: string): Promise<void> {
  const assumption = await assumptionsRepo.get(assumptionId)
  if (!assumption) throw new DomainError('INTEGRITY', `关联的假设不存在: ${assumptionId}`)
  if (assumption.projectId !== projectId) {
    throw new DomainError('INTEGRITY', '实验与假设必须属于同一项目')
  }
}

export async function createExperiment(projectId: string, input: ExperimentInput): Promise<Experiment> {
  return db.transaction('rw', [db.projects, db.assumptions, db.experiments], async () => {
    const project = await projectsRepo.get(projectId)
    if (!project || project.deletedAt) {
      throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
    }
    if (input.assumptionId) await assertAssumptionLink(projectId, input.assumptionId)
    const count = await experimentsRepo.countByProject(projectId)
    if (count >= CAPS.experiments) {
      throw new DomainError('CAPACITY_LIMIT', `单项目实验数已达上限 ${CAPS.experiments}`)
    }
    const ts = nowIso()
    const row = experimentSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      projectId,
      createdAt: ts,
      updatedAt: ts,
    })
    await experimentsRepo.put(row)
    return row
  })
}

export async function updateExperiment(id: string, patch: ExperimentPatch): Promise<Experiment> {
  return db.transaction('rw', [db.experiments, db.assumptions], async () => {
    const raw = await experimentsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `实验不存在: ${id}`)
    const current = normalize(raw)
    if (patch.assumptionId && patch.assumptionId !== current.assumptionId) {
      await assertAssumptionLink(current.projectId, patch.assumptionId)
    }
    const row = experimentSchema.parse({ ...current, ...patch, updatedAt: nowIso() })
    await experimentsRepo.put(row)
    return row
  })
}

export async function getExperiment(id: string): Promise<Experiment> {
  const raw = await experimentsRepo.get(id)
  if (!raw) throw new DomainError('NOT_FOUND', `实验不存在: ${id}`)
  return normalize(raw)
}

export async function listExperimentsByProject(projectId: string): Promise<Experiment[]> {
  const rows = await experimentsRepo.byProject(projectId)
  return rows.map(normalize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function listExperimentsByAssumption(assumptionId: string): Promise<Experiment[]> {
  const rows = await experimentsRepo.byAssumption(assumptionId)
  return rows.map(normalize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Unlinks OST nodes pointing at this experiment before removal. */
export async function deleteExperiment(id: string): Promise<void> {
  await db.transaction('rw', [db.experiments, db.ost_nodes], async () => {
    const raw = await experimentsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `实验不存在: ${id}`)
    await ostRepo.unlinkExperiment(id)
    await experimentsRepo.delete(id)
  })
}
