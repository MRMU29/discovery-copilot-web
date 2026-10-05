import type { z } from 'zod'
import { db } from '@/db/db'
import { projectsRepo, reportsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS } from '@/lib/limits'
import { reportSchema, type Report } from '@/schemas/entities'

export type ReportInput = Omit<z.input<typeof reportSchema>, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
export type ReportPatch = Partial<Omit<z.input<typeof reportSchema>, 'id' | 'projectId' | 'createdAt'>>

function normalize(row: Report): Report {
  try {
    return reportSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `报告数据损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

export async function createReport(projectId: string, input: ReportInput): Promise<Report> {
  return db.transaction('rw', [db.projects, db.reports], async () => {
    const project = await projectsRepo.get(projectId)
    if (!project || project.deletedAt) {
      throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
    }
    const count = await reportsRepo.countByProject(projectId)
    if (count >= CAPS.reports) {
      throw new DomainError('CAPACITY_LIMIT', `单项目报告数已达上限 ${CAPS.reports}`)
    }
    const ts = nowIso()
    const row = reportSchema.parse({ ...input, id: crypto.randomUUID(), projectId, createdAt: ts, updatedAt: ts })
    await reportsRepo.put(row)
    return row
  })
}

export async function updateReport(id: string, patch: ReportPatch): Promise<Report> {
  return db.transaction('rw', [db.reports], async () => {
    const raw = await reportsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `报告不存在: ${id}`)
    const row = reportSchema.parse({ ...normalize(raw), ...patch, updatedAt: nowIso() })
    await reportsRepo.put(row)
    return row
  })
}

export async function getReport(id: string): Promise<Report> {
  const raw = await reportsRepo.get(id)
  if (!raw) throw new DomainError('NOT_FOUND', `报告不存在: ${id}`)
  return normalize(raw)
}

export async function listReportsByProject(projectId: string): Promise<Report[]> {
  const rows = await reportsRepo.byProject(projectId)
  return rows.map(normalize).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteReport(id: string): Promise<void> {
  await db.transaction('rw', [db.reports], async () => {
    const raw = await reportsRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `报告不存在: ${id}`)
    await reportsRepo.delete(id)
  })
}
