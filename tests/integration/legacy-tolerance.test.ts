import { beforeAll, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/db/db'
import type { Assumption, Project } from '@/schemas/entities'
import * as assumptions from '@/services/assumptions'
import * as projects from '@/services/projects'

/**
 * Field-level legacy tolerance (command-2 plan): rows written before a schema
 * extension (missing optional fields) must normalize through the zod defaults
 * on the service read path instead of crashing the app. Index-level migrations
 * stay with Dexie version() blocks (see src/db/db.ts).
 */
beforeAll(async () => {
  await resetDb()
})

describe('legacy row tolerance', () => {
  it('normalizes assumption rows missing confidence/priorityScore/status', async () => {
    const p = await projects.createProject({ name: '旧数据项目' })
    const legacy = {
      id: 'legacy-asm-1',
      projectId: p.id,
      type: 'value',
      statement: '迁移前的旧假设行',
      impact: 3,
      risk: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      // confidence / priorityScore / status 故意缺失
    } as unknown as Assumption
    await db.assumptions.add(legacy)

    const list = await assumptions.listAssumptionsByProject(p.id)
    const row = list.find((x) => x.id === 'legacy-asm-1')
    expect(row).toBeDefined()
    expect(row!.confidence).toBeNull()
    expect(row!.status).toBe('open')
    expect(row!.priorityScore).toBe(0)
  })

  it('normalizes project rows missing description/status/deletedAt', async () => {
    const legacy = {
      id: 'legacy-proj-1',
      name: '旧项目行',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      // description / status / deletedAt 故意缺失
    } as unknown as Project
    await db.projects.add(legacy)

    const active = await projects.listActiveProjects()
    const row = active.find((x) => x.id === 'legacy-proj-1')
    expect(row).toBeDefined()
    expect(row!.description).toBe('')
    expect(row!.status).toBe('active')
    expect(row!.deletedAt).toBeNull()
  })
})
