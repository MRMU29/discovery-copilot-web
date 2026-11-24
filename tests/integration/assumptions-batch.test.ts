import { beforeAll, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/db/db'
import { CAPS } from '@/lib/limits'
import * as assumptions from '@/services/assumptions'
import * as projects from '@/services/projects'

beforeAll(async () => {
  await resetDb()
})

describe('createAssumptions (bulk, single transaction)', () => {
  it('writes every row with the same score a single create would produce', async () => {
    const project = await projects.createProject({ name: '批量录入' })
    const created = await assumptions.createAssumptions(project.id, [
      { type: 'value', statement: '用户愿意为自动对账付费', impact: 5, risk: 4 },
      { type: 'usability', statement: '首次导入 5 分钟内完成', impact: 4, risk: 3 },
    ])

    expect(created).toHaveLength(2)
    expect(created[0].priorityScore).toBe(20) // 5×4×(1−0)
    expect(created[1].priorityScore).toBe(12) // 4×3

    const stored = await assumptions.listAssumptionsByProject(project.id)
    expect(stored).toHaveLength(2)

    const events = await db.score_events.toArray()
    expect(events.filter((e) => e.assumptionId === created[0].id)).toHaveLength(1)
    expect(events[0].changedBy).toBe('user')
    expect(events[0].before).toBeNull()
  })

  it('rejects the whole batch when it would exceed the capacity (nothing written)', async () => {
    const project = await projects.createProject({ name: '容量边界' })
    const existing = Array.from({ length: CAPS.assumptions - 1 }, (_, i) => ({
      type: 'value' as const,
      statement: `已有假设 ${i}`,
      impact: 3,
      risk: 3,
    }))
    await assumptions.createAssumptions(project.id, existing)
    const before = await assumptions.listAssumptionsByProject(project.id)
    expect(before).toHaveLength(CAPS.assumptions - 1)

    await expect(
      assumptions.createAssumptions(project.id, [
        { type: 'value', statement: '超出的一条', impact: 3, risk: 3 },
        { type: 'value', statement: '超出的一条之二', impact: 3, risk: 3 },
      ]),
    ).rejects.toMatchObject({ code: 'CAPACITY_LIMIT' })

    expect(await assumptions.listAssumptionsByProject(project.id)).toHaveLength(CAPS.assumptions - 1)
  })

  it('rolls back the entire batch when one row fails validation', async () => {
    const project = await projects.createProject({ name: '回滚' })
    await expect(
      assumptions.createAssumptions(project.id, [
        { type: 'value', statement: '合法的一条', impact: 3, risk: 3 },
        { type: 'value', statement: 'x'.repeat(2001), impact: 3, risk: 3 },
      ]),
    ).rejects.toThrow()

    expect(await assumptions.listAssumptionsByProject(project.id)).toHaveLength(0)
    expect((await db.score_events.toArray()).filter((e) => e.projectId === project.id)).toHaveLength(0)
  })

  it('refuses a deleted project', async () => {
    const project = await projects.createProject({ name: '回收站' })
    await projects.softDeleteProject(project.id)
    await expect(
      assumptions.createAssumptions(project.id, [{ type: 'value', statement: 'x', impact: 3, risk: 3 }]),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
