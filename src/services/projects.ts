import type { z } from 'zod'
import { db } from '@/db/db'
import { deleteProjectChildren, projectsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS, RETENTION_MS } from '@/lib/limits'
import { projectSchema, type Project } from '@/schemas/entities'

type ProjectInput = Omit<z.input<typeof projectSchema>, 'id' | 'createdAt' | 'updatedAt'>
type ProjectPatch = Partial<Omit<z.input<typeof projectSchema>, 'id' | 'createdAt'>>

export async function createProject(input: ProjectInput): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const total = await projectsRepo.countAll()
    if (total >= CAPS.projects) {
      throw new DomainError('CAPACITY_LIMIT', `本地项目总数已达上限（${CAPS.projects}，含回收站）`)
    }
    const ts = nowIso()
    const row = projectSchema.parse({ ...input, id: crypto.randomUUID(), createdAt: ts, updatedAt: ts })
    await projectsRepo.put(row)
    return row
  })
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const existing = await projectsRepo.get(id)
    if (!existing) throw new DomainError('NOT_FOUND', `项目不存在: ${id}`)
    const row = projectSchema.parse({ ...existing, ...patch, updatedAt: nowIso() })
    await projectsRepo.put(row)
    return row
  })
}

export async function getProject(id: string): Promise<Project> {
  const row = await projectsRepo.get(id)
  if (!row) throw new DomainError('NOT_FOUND', `项目不存在: ${id}`)
  return projectSchema.parse(row)
}

/** Recycle bin entry point (§7.6): soft delete keeps 30-day restorable copy. */
export async function softDeleteProject(id: string): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const existing = await projectsRepo.get(id)
    if (!existing) throw new DomainError('NOT_FOUND', `项目不存在: ${id}`)
    if (existing.deletedAt) return projectSchema.parse(existing)
    const row = projectSchema.parse({ ...existing, deletedAt: nowIso(), updatedAt: nowIso() })
    await projectsRepo.put(row)
    return row
  })
}

export async function restoreProject(id: string): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const existing = await projectsRepo.get(id)
    if (!existing) throw new DomainError('NOT_FOUND', `项目不存在: ${id}`)
    if (!existing.deletedAt) return projectSchema.parse(existing)
    const row = projectSchema.parse({ ...existing, deletedAt: null, updatedAt: nowIso() })
    await projectsRepo.put(row)
    return row
  })
}

export async function listActiveProjects(): Promise<Project[]> {
  const rows = await projectsRepo.all()
  return rows.filter((r) => r.deletedAt == null).map((r) => projectSchema.parse(r))
}

export async function listDeletedProjects(): Promise<Project[]> {
  const rows = await projectsRepo.all()
  return rows.filter((r) => r.deletedAt != null).map((r) => projectSchema.parse(r))
}

/** Hard delete with full cascade; caller decides when (purge sweep or explicit UI action). */
export async function deleteProjectCascade(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.assumptions, db.experiments, db.ost_nodes, db.reports, db.score_events],
    async () => {
      const existing = await projectsRepo.get(id)
      if (!existing) throw new DomainError('NOT_FOUND', `项目不存在: ${id}`)
      await deleteProjectChildren(id)
      await projectsRepo.delete(id)
    },
  )
}

/** Purge recycle-bin projects older than the 30-day retention (§7.6). `nowMs` injectable. */
export async function purgeExpiredProjects(nowMs: number = Date.now()): Promise<number> {
  const deleted = await listDeletedProjects()
  const expired = deleted.filter((p) => nowMs - Date.parse(p.deletedAt!) > RETENTION_MS)
  for (const p of expired) {
    await deleteProjectCascade(p.id)
  }
  return expired.length
}
