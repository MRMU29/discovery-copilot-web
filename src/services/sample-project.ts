import type { z } from 'zod'
import { nowIso } from '@/lib/clock'
import { createAssumption, type ScoreChangeActor } from './assumptions'
import { createExperiment } from './experiments'
import { createOstNode } from './ost'
import { createReport } from './reports'
import { createProject } from './projects'
import { assumptionSchema, experimentSchema, type Project } from '@/schemas/entities'

/**
 * 示例项目（命令 7 新手指引）：静态数据「宠物鲜食外卖」，一键写入 IndexedDB，
 * 零 AI 调用。走服务层落库——priorityScore、score_events、容量与完整性校验
 * 全部沿用正式写路径；每次加载生成新 id，可与用户项目并存。OST 坐标按
 * OstCanvas 节点宽 220px 的网格布局预排。
 */

type SampleAssumption = {
  key: string
  statement: string
  type: z.infer<typeof assumptionSchema>['type']
  impact: number
  risk: number
  confidence: number | null
}

type SampleExperiment = {
  key: string
  assumptionKey: string
  hypothesis: string
  method: string
  successCriteria: string
  status: z.infer<typeof experimentSchema>['status']
  result: string | null
}

const ASSUMPTIONS: SampleAssumption[] = [
  {
    key: 'value-willingness',
    statement: '城市养宠家庭愿意为每周订阅的定制鲜食支付每月 300 元以上',
    type: 'value',
    impact: 5,
    risk: 4,
    confidence: null,
  },
  {
    key: 'value-convenience',
    statement: '自制鲜食的时间成本是目标用户放弃鲜食的首要原因',
    type: 'value',
    impact: 4,
    risk: 4,
    confidence: null,
  },
  {
    key: 'usability-first-order',
    statement: '目标用户能在 3 分钟内不看说明完成首次下单选餐',
    type: 'usability',
    impact: 4,
    risk: 4,
    confidence: 0.3,
  },
  {
    key: 'feasibility-cold-chain',
    statement: '按周生产的鲜食在 72 小时冷链配送后仍能保持品质稳定',
    type: 'feasibility',
    impact: 4,
    risk: 3,
    confidence: null,
  },
  {
    key: 'viability-margin',
    statement: '客单价 75 元时毛利率能覆盖冷链配送与获客成本',
    type: 'viability',
    impact: 4,
    risk: 3,
    confidence: 0.5,
  },
  {
    key: 'gtm-community',
    statement: '小区宠物社群团长渠道能带来每月 200 个以上新客',
    type: 'go-to-market',
    impact: 3,
    risk: 4,
    confidence: null,
  },
  {
    key: 'strategy-wedge',
    statement: '从鲜食订阅切入比从零食单品切入更能建立复购壁垒',
    type: 'strategy',
    impact: 5,
    risk: 3,
    confidence: 0.6,
  },
  {
    key: 'legal-license',
    statement: '鲜食生产不需要食品生产许可证以外的额外宠物食品审批',
    type: 'legal',
    impact: 2,
    risk: 5,
    confidence: null,
  },
]

const EXPERIMENTS: SampleExperiment[] = [
  {
    key: 'exp-fake-door',
    assumptionKey: 'value-willingness',
    hypothesis: '若在宠物社群投放「鲜食订阅」假门入口，则 10% 以上的浏览者会留下订阅意向',
    method: '假门测试：3 个试点小区社群投放入口页，运行 7 天记录浏览与留资',
    successCriteria: '7 天留资率 ≥ 10%，收集意向 ≥ 60 条',
    status: 'planned',
    result: null,
  },
  {
    key: 'exp-wizard-of-oz',
    assumptionKey: 'value-convenience',
    hypothesis: '若由人工每周为 10 户家庭配送定制鲜食，则 6 户以上会连续订阅第 2 期',
    method: 'Wizard of Oz：人工模拟订阅服务跑 2 期，观察实际续订行为并访谈',
    successCriteria: '10 户中 ≥ 6 户续订第 2 期',
    status: 'running',
    result: null,
  },
  {
    key: 'exp-prototype-order',
    assumptionKey: 'usability-first-order',
    hypothesis: '若提供 6 款预设菜单模板，则 80% 体验用户能在 3 分钟内完成首单选餐',
    method: '原型任务测试：12 名目标用户在可点击原型上完成选餐任务，记录耗时与卡点',
    successCriteria: '12 人中 ≥ 9 人在 3 分钟内完成且无需帮助',
    status: 'completed',
    result: '12 人中 10 人在 3 分钟内完成（83%），卡点集中在过敏原筛选——已反馈菜单结构。',
  },
]

const DESCRIPTION =
  '面向城市养宠家庭的鲜食外卖订阅：按周定制菜单、冷链到家，解决「想喂鲜食但没时间做」的问题。目标用户是一二线城市、月宠物支出 500 元以上的养猫养狗家庭；期望 3 个月内用最小成本验证订阅需求与单位经济模型。'

export const SAMPLE_PROJECT_NAME = '示例 · 宠物鲜食外卖'

export interface SampleProjectRefs {
  project: Project
  assumptionIds: Record<string, string>
  experimentIds: Record<string, string>
}

/**
 * 写入完整示例项目并返回各实体 id（浏览器验收与测试都用它断言）。
 * 演示数据的评分事件 changedBy 记为 'user'（它不是 AI 建议）。
 */
export async function loadSampleProject(): Promise<SampleProjectRefs> {
  const project = await createProject({ name: SAMPLE_PROJECT_NAME, description: DESCRIPTION })

  const assumptionIds: Record<string, string> = {}
  for (const a of ASSUMPTIONS) {
    const row = await createAssumption(
      project.id,
      { statement: a.statement, type: a.type, impact: a.impact, risk: a.risk, confidence: a.confidence },
      { changedBy: 'user' satisfies ScoreChangeActor },
    )
    assumptionIds[a.key] = row.id
  }

  const experimentIds: Record<string, string> = {}
  for (const e of EXPERIMENTS) {
    const row = await createExperiment(project.id, {
      hypothesis: e.hypothesis,
      method: e.method,
      successCriteria: e.successCriteria,
      status: e.status,
      result: e.result,
      assumptionId: assumptionIds[e.assumptionKey],
    })
    experimentIds[e.key] = row.id
  }

  await createOstChain(project.id, assumptionIds, experimentIds)

  await createReport(project.id, {
    title: '宠物鲜食外卖 · 发现报告（示例）',
    content: SAMPLE_REPORT,
    generatedSections: ['背景', '假设优先级', '实验计划', '结论与下一步'],
    generatedAt: nowIso(),
  })

  return { project, assumptionIds, experimentIds }
}

async function createOstChain(
  projectId: string,
  assumptionIds: Record<string, string>,
  experimentIds: Record<string, string>,
): Promise<void> {
  const outcome = await createOstNode(projectId, {
    type: 'outcome',
    parentId: null,
    title: '验证：试点小区的鲜食订阅需求真实存在',
    position: { x: 1090, y: 40 },
  })

  const oppDemand = await createOstNode(projectId, {
    type: 'opportunity',
    parentId: outcome.id,
    title: '养宠家庭想喂鲜食，但被制作时间劝退',
    position: { x: 700, y: 240 },
    linkedAssumptionId: assumptionIds['value-convenience'],
  })
  const oppPrice = await createOstNode(projectId, {
    type: 'opportunity',
    parentId: outcome.id,
    title: '现有鲜食配送价格高、订阅门槛高',
    position: { x: 1480, y: 240 },
    linkedAssumptionId: assumptionIds['viability-margin'],
  })

  await createOstNode(projectId, {
    type: 'solution',
    parentId: oppDemand.id,
    title: '小区团购 + 自提点，砍掉末端配送成本',
    position: { x: 480, y: 470 },
  })
  const solSubscription = await createOstNode(projectId, {
    type: 'solution',
    parentId: oppDemand.id,
    title: '每周订阅菜单 + 72 小时冷链包',
    position: { x: 920, y: 470 },
    linkedAssumptionId: assumptionIds['feasibility-cold-chain'],
  })
  const solTrial = await createOstNode(projectId, {
    type: 'solution',
    parentId: oppPrice.id,
    title: '首单 9.9 元体验装降低尝试门槛',
    position: { x: 1360, y: 470 },
    linkedAssumptionId: assumptionIds['gtm-community'],
  })

  await createOstNode(projectId, {
    type: 'experiment',
    parentId: solSubscription.id,
    title: '实验：假门测试订阅意向（7 天留资率）',
    position: { x: 820, y: 700 },
    linkedExperimentId: experimentIds['exp-fake-door'],
    linkedAssumptionId: assumptionIds['value-willingness'],
  })
  await createOstNode(projectId, {
    type: 'experiment',
    parentId: solTrial.id,
    title: '实验：原型选餐任务测试（3 分钟首单）',
    position: { x: 1420, y: 700 },
    linkedExperimentId: experimentIds['exp-prototype-order'],
    linkedAssumptionId: assumptionIds['usability-first-order'],
  })
}


const SAMPLE_REPORT = `## 背景
面向城市养宠家庭的鲜食外卖订阅：按周定制菜单、冷链到家，解决「想喂鲜食但没时间做」的问题。

## 假设优先级
- 最高优先分：付费意愿（价值，20.0）——直接决定收入模型，当前零证据。
- 已有部分证据：首单选餐可用性（信心 30%）与单位经济模型（信心 50%）。
- 法律合规（风险 5）虽优先分不高，但一旦判断错误即叫停，保持关注。

## 实验计划
1. 假门测试（待执行）：7 天留资率 ≥ 10% 即验证付费意向。
2. Wizard of Oz（进行中）：10 户人工配送，观察第 2 期续订行为。
3. 原型选餐任务（已完成）：83% 用户 3 分钟内完成首单，可用性风险下降。

## 结论与下一步
价值假设仍是最大缺口：优先执行假门测试，同时跟进 Wizard of Oz 的续订数据；若两实验均达标，进入 MVP 范围裁决。`