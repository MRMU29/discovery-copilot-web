import { beforeAll, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { resetDb } from '@/db/db'
import * as assumptions from '@/services/assumptions'
import * as projects from '@/services/projects'
import { DomainError } from '@/lib/errors'

/**
 * v0.2.2 project organization: rename and archive were reachable through the
 * service layer but had no UI. These tests pin the semantics the UI relies on
 * — id stability, blank-name rejection, and archive being a reversible flag
 * rather than a delete.
 */

beforeAll(async () => {
  await resetDb()
})

describe('renameProject', () => {
  it('changes only the display name and keeps id + children intact', async () => {
    const p = await projects.createProject({ name: '旧名字', description: 'd' })
    const a = await assumptions.createAssumption(p.id, {
      type: 'value',
      statement: '用户愿意为自动对账付费',
      impact: 4,
      risk: 3,
    })

    const renamed = await projects.renameProject(p.id, '  新名字  ')
    expect(renamed.id).toBe(p.id)
    expect(renamed.name).toBe('新名字')
    expect(renamed.description).toBe('d')
    expect(renamed.createdAt).toBe(p.createdAt)

    const reloaded = await projects.getProject(p.id)
    expect(reloaded.name).toBe('新名字')
    const rows = await assumptions.listAssumptionsByProject(p.id)
    expect(rows.map((r) => r.id)).toEqual([a.id])
  })

  it('rejects a blank name instead of persisting an empty project', async () => {
    const p = await projects.createProject({ name: '保留我' })
    await expect(projects.renameProject(p.id, '   ')).rejects.toBeInstanceOf(DomainError)
    await expect(projects.renameProject(p.id, '')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await projects.getProject(p.id)).name).toBe('保留我')
  })
})

describe('setProjectArchived', () => {
  it('is reversible and never removes rows', async () => {
    const p = await projects.createProject({ name: '归档候选' })
    await assumptions.createAssumption(p.id, {
      type: 'feasibility',
      statement: '可以离线导入',
      impact: 3,
      risk: 3,
    })

    const archived = await projects.setProjectArchived(p.id, true)
    expect(archived.status).toBe('archived')
    expect(archived.deletedAt).toBeNull()
    // listActiveProjects means "not in the recycle bin"; the Dashboard does the
    // archived split so backups and provider scoping still see every project.
    expect((await projects.listActiveProjects()).map((x) => x.id)).toContain(p.id)
    expect(await assumptions.listAssumptionsByProject(p.id)).toHaveLength(1)

    const restored = await projects.setProjectArchived(p.id, false)
    expect(restored.status).toBe('active')
  })
})
