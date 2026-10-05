import { beforeAll, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { db, resetDb } from '@/db/db'
import { scoreEventsRepo } from '@/db/repositories'
import { CAPS, RETENTION_MS } from '@/lib/limits'
import * as assumptions from '@/services/assumptions'
import * as experiments from '@/services/experiments'
import * as ost from '@/services/ost'
import * as projects from '@/services/projects'
import * as reports from '@/services/reports'
import * as settings from '@/services/settings'

beforeAll(async () => {
  await resetDb()
})

describe('persistence & CRUD (AC-01 前半)', () => {
  it('keeps data after close/reopen on the same storage', async () => {
    const p = await projects.createProject({ name: '持久化项目', description: 'd' })
    const a = await assumptions.createAssumption(p.id, {
      type: 'value',
      statement: '用户愿意为离线能力切换工具',
      impact: 5,
      risk: 4,
    })
    expect(a.priorityScore).toBe(20) // 5×4×(1−null→0)

    await db.close()
    await db.open() // Dexie 4 needs an explicit reopen after close()
    const reopened = await projects.getProject(p.id)
    expect(reopened.name).toBe('持久化项目')
    const list = await assumptions.listAssumptionsByProject(p.id)
    expect(list.map((x) => x.id)).toContain(a.id)
    expect(list[0].priorityScore).toBe(20)
  })
})

describe('priority derivation & audit (§5.2)', () => {
  it('derives the score on write and appends before/after audit events', async () => {
    const p = await projects.createProject({ name: '审计项目' })
    const a = await assumptions.createAssumption(p.id, {
      type: 'feasibility',
      statement: '浏览器直连 AI 可行',
      impact: 5,
      risk: 4,
    })
    const events1 = await scoreEventsRepo.byAssumption(a.id)
    expect(events1.length).toBe(1)
    expect(events1[0].before).toBeNull()
    expect(events1[0].after.priorityScore).toBe(20)

    const updated = await assumptions.updateAssumption(a.id, { confidence: 0.5 })
    expect(updated.priorityScore).toBe(10) // 20 × (1−0.5)

    await assumptions.updateAssumption(a.id, { statement: '浏览器直连 AI 可行（改写）' })
    const events = await scoreEventsRepo.byAssumption(a.id)
    expect(events.length).toBe(2) // 非评分字段变更不产生事件
    const last = events.sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0))[1]
    expect(last.before?.priorityScore).toBe(20)
    expect(last.after.priorityScore).toBe(10)
  })
})

describe('recycle bin (§7.6)', () => {
  it('soft-deletes, restores, and purges after the 30-day retention', async () => {
    const p = await projects.createProject({ name: '回收站项目' })
    await assumptions.createAssumption(p.id, {
      type: 'value',
      statement: 's',
      impact: 3,
      risk: 3,
    })

    await projects.softDeleteProject(p.id)
    expect((await projects.listActiveProjects()).some((x) => x.id === p.id)).toBe(false)
    expect((await projects.listDeletedProjects()).some((x) => x.id === p.id)).toBe(true)

    await projects.restoreProject(p.id)
    expect((await projects.listActiveProjects()).some((x) => x.id === p.id)).toBe(true)

    await projects.softDeleteProject(p.id)
    expect(await projects.purgeExpiredProjects(Date.now())).toBe(0) // 未满 30 天
    const purged = await projects.purgeExpiredProjects(Date.now() + RETENTION_MS + 1000)
    expect(purged).toBeGreaterThanOrEqual(1)
    await expect(projects.getProject(p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await db.assumptions.where('projectId').equals(p.id).count()).toBe(0) // 级联清除
  })
})

describe('integrity rules', () => {
  it('rejects experiments whose linked assumption lives in another project', async () => {
    const pa = await projects.createProject({ name: 'A' })
    const pb = await projects.createProject({ name: 'B' })
    const a = await assumptions.createAssumption(pa.id, {
      type: 'value',
      statement: 'sa',
      impact: 2,
      risk: 2,
    })
    await expect(
      experiments.createExperiment(pb.id, {
        assumptionId: a.id,
        hypothesis: '跨项目引用',
        method: 'smoke',
      }),
    ).rejects.toMatchObject({ code: 'INTEGRITY' })
    const ok = await experiments.createExperiment(pb.id, {
      hypothesis: '无关联实验',
      method: 'smoke',
    })
    expect(ok.assumptionId).toBeNull()
  })

  it('deleting an assumption unlinks experiments/OST and drops its audit trail', async () => {
    const p = await projects.createProject({ name: '解链项目' })
    const a = await assumptions.createAssumption(p.id, {
      type: 'value',
      statement: 'sa',
      impact: 3,
      risk: 2,
    })
    const exp = await experiments.createExperiment(p.id, {
      assumptionId: a.id,
      hypothesis: 'h',
      method: 'm',
    })
    const outcome = await ost.createOstNode(p.id, { type: 'outcome', title: 'O' })
    const node = await ost.createOstNode(p.id, {
      type: 'opportunity',
      title: 'n',
      parentId: outcome.id,
      linkedAssumptionId: a.id,
    })

    await assumptions.deleteAssumption(a.id)

    expect((await experiments.getExperiment(exp.id)).assumptionId).toBeNull()
    expect((await ost.getOstNode(node.id)).linkedAssumptionId).toBeNull()
    expect(await scoreEventsRepo.byAssumption(a.id)).toHaveLength(0)
  })

  it('rejects OST links that point at another project’s entities', async () => {
    const pa = await projects.createProject({ name: '链接-A' })
    const pb = await projects.createProject({ name: '链接-B' })
    const a = await assumptions.createAssumption(pa.id, {
      type: 'value',
      statement: 'sa',
      impact: 1,
      risk: 1,
    })
    await expect(
      ost.createOstNode(pb.id, { type: 'outcome', title: 'n', linkedAssumptionId: a.id }),
    ).rejects.toMatchObject({ code: 'INTEGRITY' })
  })

  it('enforces the OST parent chain, cycle guard, and subtree cascade', async () => {
    const p = await projects.createProject({ name: 'OST 项目' })
    const outcome = await ost.createOstNode(p.id, { type: 'outcome', title: '期望结果' })
    const opportunity = await ost.createOstNode(p.id, {
      type: 'opportunity',
      title: '机会',
      parentId: outcome.id,
    })
    await expect(
      ost.createOstNode(p.id, { type: 'solution', title: '错挂', parentId: outcome.id }),
    ).rejects.toMatchObject({ code: 'PARENT_RULE' })
    const solution = await ost.createOstNode(p.id, {
      type: 'solution',
      title: '方案',
      parentId: opportunity.id,
    })
    // 类型链（outcome←opportunity←solution←experiment）使环结构上不可能：
    // PARENT_RULE 总是先于 CYCLE 守卫拦截；守卫保留作纵深防御。
    await expect(
      ost.moveOstNode(outcome.id, { parentId: opportunity.id }),
    ).rejects.toMatchObject({ code: 'PARENT_RULE' })
    const removed = await ost.deleteOstNode(outcome.id)
    expect(removed).toBe(3) // outcome + opportunity + solution
    await expect(ost.getOstNode(opportunity.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(ost.getOstNode(solution.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('reports & settings', () => {
  it('round-trips reports and rejects secret-shaped settings', async () => {
    const p = await projects.createProject({ name: '报告项目' })
    const r = await reports.createReport(p.id, { title: '发现报告 v1' })
    await reports.updateReport(r.id, { content: '## 结论' })
    const list = await reports.listReportsByProject(p.id)
    expect(list[0].content).toBe('## 结论')

    expect((await settings.getSettings()).theme).toBe('dark')
    await settings.updateSettings({ theme: 'light' })
    expect((await settings.getSettings()).theme).toBe('light')
    await expect(settings.updateSettings({ apiKey: 'sk-x' })).rejects.toMatchObject({
      code: 'SECRET_REJECTED',
    })
    await expect(settings.updateSettings({ bogus: 1 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  })
})

describe('capacity ceilings (§5.4)', () => {
  it('rejects the 201st assumption per project', async () => {
    const p = await projects.createProject({ name: '容量项目' })
    for (let i = 0; i < CAPS.assumptions; i++) {
      await assumptions.createAssumption(p.id, {
        type: 'value',
        statement: `s${i}`,
        impact: 1,
        risk: 1,
      })
    }
    await expect(
      assumptions.createAssumption(p.id, { type: 'value', statement: 'over', impact: 1, risk: 1 }),
    ).rejects.toMatchObject({ code: 'CAPACITY_LIMIT' })
  }, 60_000)

  it('rejects the 51st project (recycle bin counts toward the cap)', async () => {
    const start = await db.projects.count()
    for (let i = start; i < CAPS.projects; i++) {
      await projects.createProject({ name: `filler-${i}` })
    }
    await expect(projects.createProject({ name: 'over' })).rejects.toMatchObject({
      code: 'CAPACITY_LIMIT',
    })
    await db.projects.clear()
  })
})
