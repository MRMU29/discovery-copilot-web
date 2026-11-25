// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { resetDb } from '@/db/db'
import { buildProjectPackage } from '@/services/project-package'
import { createAssumption } from '@/services/assumptions'
import { createExperiment } from '@/services/experiments'
import { createProject, softDeleteProject } from '@/services/projects'
import { createReport } from '@/services/reports'

beforeEach(async () => {
  await resetDb()
})

describe('buildProjectPackage', () => {
  it('aggregates every project table into one self-contained file', async () => {
    const project = await createProject({ name: '宠物鲜食' })
    await createAssumption(project.id, {
      type: 'value',
      statement: '用户愿意为订阅付费',
      impact: 4,
      risk: 5,
    })
    await createExperiment(project.id, {
      hypothesis: '若提供试吃则转化提升',
      method: '假门测试',
      status: 'completed',
      outcome: 'supported',
      metric: '转化率',
      actualValue: '12%',
    })
    await createReport(project.id, { title: '发现报告', content: '## 背景\n订阅制宠物鲜食' })

    const result = await buildProjectPackage(project.id)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fileName).toBe('宠物鲜食-package.html')
    expect(result.bytes).toBeGreaterThan(0)
    expect(result.bytes).toBeLessThan(2 * 1024 * 1024)
    expect(result.html).toContain('宠物鲜食')
    expect(result.html).toContain('用户愿意为订阅付费')
    expect(result.html).toContain('订阅制宠物鲜食')
    expect(result.html).toContain('假门测试')
  })

  it('refuses a missing project', async () => {
    await expect(buildProjectPackage('nope')).resolves.toEqual({
      ok: false,
      reason: 'not-found',
      bytes: 0,
    })
  })

  it('refuses a project in the recycle bin', async () => {
    const project = await createProject({ name: '已删除' })
    await softDeleteProject(project.id)
    const result = await buildProjectPackage(project.id)
    expect(result).toMatchObject({ ok: false, reason: 'not-found' })
  })
})
