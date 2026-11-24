import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '@/db/db'
import { createAssumption } from '@/services/assumptions'
import { createDecision, supersedeDecision } from '@/services/decisions'
import { createExperiment } from '@/services/experiments'
import { createProject } from '@/services/projects'
import { buildReportContext } from '@/services/report-ai'

/**
 * 报告上下文的决策段与实验结论标签：这两块会被拼进 Prompt，
 * 多一个空标题或少一个结论都会让模型编造，所以单独守。
 */

beforeEach(async () => {
  await resetDb()
})

async function seedProject(): Promise<string> {
  const project = await createProject({ name: '上下文项目' })
  await createAssumption(project.id, {
    statement: '用户愿意付费',
    type: 'value',
    impact: 4,
    risk: 4,
    confidence: null,
  })
  return project.id
}

describe('buildReportContext · 决策记录', () => {
  it('active + superseded 都出现，被推翻那条带「（已推翻）」', async () => {
    const projectId = await seedProject()
    await createDecision(projectId, { statement: '先验证付费意愿', rationale: '成本最低' })
    const old = await createDecision(projectId, { statement: '首期做原生 App' })
    await supersedeDecision(old.id)

    const context = await buildReportContext(projectId)
    expect(context).toContain('### 决策记录')
    expect(context).toContain('先验证付费意愿')
    expect(context).toContain('（已推翻）')
    expect(context).toContain('推翻于')
  })

  it('没有决策时不输出决策段标题', async () => {
    const projectId = await seedProject()
    const context = await buildReportContext(projectId)
    expect(context).not.toContain('### 决策记录')
  })
})

describe('buildReportContext · 实验结论', () => {
  it('outcome=supported 输出「结论：支持」，null 不输出结论行', async () => {
    const projectId = await seedProject()
    await createExperiment(projectId, {
      hypothesis: '若提供订阅则复购率 ≥ 30%',
      method: '试点',
      successCriteria: '≥ 30%',
      status: 'completed',
      result: '达到 35%',
      outcome: 'supported',
      metric: '30 天复购率',
      actualValue: '35%',
    })
    await createExperiment(projectId, {
      hypothesis: '尚未评估的实验',
      method: '待定',
      successCriteria: null,
    })

    const context = await buildReportContext(projectId)
    expect(context).toContain('结论：支持')
    expect(context).toContain('指标：30 天复购率 = 35%')

    const lines = context.split('\n')
    const unevaluated = lines.find((line) => line.includes('尚未评估的实验'))
    expect(unevaluated).toBeTruthy()
    expect(unevaluated).not.toContain('结论：')
  })
})
