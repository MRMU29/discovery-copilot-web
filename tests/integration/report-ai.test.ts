import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider, type AdapterDeps } from '@/ai/providers/openai-compatible'
import type { ProviderConfig } from '@/ai/types'
import { db, resetDb } from '@/db/db'
import { CAPS } from '@/lib/limits'
import type { Report } from '@/schemas/entities'
import { createAssumption } from '@/services/assumptions'
import { createExperiment } from '@/services/experiments'
import { createOstNode } from '@/services/ost'
import { createProject } from '@/services/projects'
import {
  applyReportDraft,
  buildReportContext,
  deriveSections,
  generateReport,
  reportResultSchema,
} from '@/services/report-ai'
import { updateSettings } from '@/services/settings'

beforeEach(async () => {
  await resetDb()
})

interface ScriptedResponse {
  status: number
  body: unknown
}

function mockFetch(responses: ScriptedResponse[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const next = responses.shift()
    if (!next) throw new Error('no scripted response left')
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const config: ProviderConfig = {
  id: 'prov-report',
  label: 'DeepSeek',
  kind: 'openai-compatible',
  baseUrl: 'https://api.test/v1',
  model: 'deepseek-chat',
  createdAt: '2026-10-04T00:00:00.000Z',
}

function makeProvider(fetchImpl: typeof fetch) {
  return new OpenAICompatibleProvider(config, { fetchImpl, getApiKey: () => 'sk-test' } satisfies AdapterDeps)
}

const okChat = (content: string) => ({
  status: 200,
  body: {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 800, completion_tokens: 1200 },
  },
})

const validDraft = {
  title: '自动对账助手 · 发现报告',
  sections: ['背景', '假设优先级', '结论与下一步'],
  content: [
    '## 背景',
    '面向中小企业主的自动对账助手，解决人工对账耗时易错的问题。',
    '',
    '## 假设优先级',
    '- 付费意愿（价值）优先分最高。',
    '',
    '## 结论与下一步',
    '优先执行假门测试验证付费意向。',
  ].join('\n'),
}

async function seedProject() {
  const project = await createProject({ name: '自动对账助手', description: '浏览器端自动对账工具' })
  const a1 = await createAssumption(project.id, {
    statement: '中小企业主愿意为自动对账功能支付每月 30 元订阅费',
    type: 'value',
    impact: 5,
    risk: 4,
    confidence: null,
  })
  await createAssumption(project.id, {
    statement: '财务人员能在 5 分钟内完成首次流水导入',
    type: 'usability',
    impact: 4,
    risk: 4,
    confidence: 0.3,
  })
  await createExperiment(project.id, {
    assumptionId: a1.id,
    hypothesis: '若放置假门入口，则 25% 以上新用户在 7 天内点击',
    method: '假门测试：引导页放置入口，统计 7 天点击',
    successCriteria: '7 天点击率 ≥ 25%',
    status: 'planned',
  })
  await createOstNode(project.id, {
    type: 'outcome',
    parentId: null,
    title: '中小企业对账零负担',
    position: { x: 0, y: 0 },
  })
  return project
}

describe('reportResultSchema', () => {
  it('accepts the flat draft and unwraps a {"report": …} envelope', () => {
    const flat = reportResultSchema.parse(validDraft)
    expect(flat.title).toBe(validDraft.title)
    const wrapped = reportResultSchema.parse({ report: validDraft })
    expect(wrapped).toEqual(flat)
  })

  it('rejects missing title, empty content and out-of-bounds sections', () => {
    expect(reportResultSchema.safeParse({ ...validDraft, title: '' }).success).toBe(false)
    expect(reportResultSchema.safeParse({ ...validDraft, content: '' }).success).toBe(false)
    expect(
      reportResultSchema.safeParse({ ...validDraft, sections: Array.from({ length: 13 }, (_, i) => `节${i}`) })
        .success,
    ).toBe(false)
  })
})

describe('deriveSections', () => {
  it('extracts unique ## headings in order and ignores deeper levels', () => {
    expect(deriveSections(validDraft.content)).toEqual(['背景', '假设优先级', '结论与下一步'])
    expect(deriveSections('## A\n## A\n### B\n## ')).toEqual(['A'])
  })
})

describe('buildReportContext', () => {
  it('aggregates assumptions (score-sorted), experiments and the OST tree', async () => {
    const project = await seedProject()
    const context = await buildReportContext(project.id)

    expect(context).toContain('自动对账助手')
    expect(context).toContain('浏览器端自动对账工具')
    // assumptions sorted by priority score: 20.00 (5×4×1) before 8.40 (4×4×0.7)
    const a1 = context.indexOf('每月 30 元订阅费')
    const a2 = context.indexOf('首次流水导入')
    expect(a1).toBeGreaterThanOrEqual(0)
    expect(a2).toBeGreaterThan(a1)
    expect(context).toContain('优先分 20.00')
    expect(context).toContain('信心 30%')
    expect(context).toContain('待验证')
    expect(context).toContain('假门测试：引导页放置入口，统计 7 天点击')
    expect(context).toContain('- 目标结果：中小企业对账零负担')
  })

  it('throws NOT_FOUND for a missing project', async () => {
    await expect(buildReportContext('no-such-project')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('generateReport (command 9)', () => {
  it('rejects a too-short context before any request', async () => {
    const { fetchImpl, calls } = mockFetch([])
    await expect(
      generateReport(makeProvider(fetchImpl), { projectId: 'p1', context: '太短' }),
    ).rejects.toThrowError()
    expect(calls).toHaveLength(0)
  })

  it('parses a fenced reply and records the feature prompt in the usage ledger', async () => {
    const project = await seedProject()
    const context = await buildReportContext(project.id)
    const { fetchImpl, calls } = mockFetch([okChat('```json\n' + JSON.stringify(validDraft) + '\n```')])
    const result = await generateReport(makeProvider(fetchImpl), {
      projectId: project.id,
      projectName: project.name,
      context,
    })

    expect(result.data.title).toBe(validDraft.title)
    expect(result.attempts).toBe(1)
    expect(calls).toHaveLength(1)

    const requests = await db.ai_requests.toArray()
    expect(requests).toHaveLength(1)
    expect(requests[0]!.promptId).toBe('generate-report')
    expect(requests[0]!.promptVersion).toBe('1.0.0')
    expect(requests[0]!.kind).toBe('json')
    expect(requests[0]!.status).toBe('ok')
  })

  it('unwraps a {"report": …} envelope from the model', async () => {
    const project = await seedProject()
    const context = await buildReportContext(project.id)
    const { fetchImpl } = mockFetch([okChat(JSON.stringify({ report: validDraft }))])
    const result = await generateReport(makeProvider(fetchImpl), { projectId: project.id, context })
    expect(result.data).toEqual(validDraft)
  })

  it('honors the per-request budget breaker and the single-shot confirmation', async () => {
    const project = await seedProject()
    const context = await buildReportContext(project.id)
    await updateSettings({ perRequestBudgetUsd: 0.000001 })

    const blocked = mockFetch([])
    await expect(
      generateReport(makeProvider(blocked.fetchImpl), { projectId: project.id, context }),
    ).rejects.toMatchObject({ code: 'BUDGET' })
    expect(blocked.calls).toHaveLength(0)

    const { fetchImpl, calls } = mockFetch([okChat(JSON.stringify(validDraft))])
    const result = await generateReport(makeProvider(fetchImpl), {
      projectId: project.id,
      context,
      budgetConfirmed: true,
    })
    expect(result.data.title).toBe(validDraft.title)
    expect(calls).toHaveLength(1)
  })
})

describe('applyReportDraft (command 9)', () => {
  it('persists the reviewed draft with generation provenance (AC-07)', async () => {
    const project = await seedProject()
    const report = await applyReportDraft(project.id, validDraft)

    expect(report.projectId).toBe(project.id)
    expect(report.generatedAt).not.toBeNull()
    // sections re-derived from content, not trusted from the model's list
    expect(report.generatedSections).toEqual(['背景', '假设优先级', '结论与下一步'])

    const stored: Report | undefined = await db.reports.get(report.id)
    expect(stored?.content).toContain('## 假设优先级')
  })

  it('falls back to the model sections when content carries no ## headings', async () => {
    const project = await seedProject()
    const report = await applyReportDraft(project.id, {
      ...validDraft,
      sections: ['模型给出的节'],
      content: '一段没有节标题的正文。',
    })
    expect(report.generatedSections).toEqual(['模型给出的节'])
  })

  it('rewrites an existing report in place (AI 重写)', async () => {
    const project = await seedProject()
    const first = await applyReportDraft(project.id, validDraft)
    const rewritten = await applyReportDraft(
      project.id,
      { ...validDraft, title: '重写版报告', content: '## 新背景\n重写后的正文。' },
      first.id,
    )
    expect(rewritten.id).toBe(first.id)
    expect(rewritten.title).toBe('重写版报告')
    expect(rewritten.generatedSections).toEqual(['新背景'])
    expect(Date.parse(rewritten.generatedAt!)).toBeGreaterThanOrEqual(Date.parse(first.generatedAt!))
    expect(await db.reports.where('projectId').equals(project.id).count()).toBe(1)
  })

  it('rejects rewriting a report that belongs to another project', async () => {
    const p1 = await createProject({ name: '项目一' })
    const p2 = await createProject({ name: '项目二' })
    const report = await applyReportDraft(p1.id, validDraft)
    await expect(applyReportDraft(p2.id, validDraft, report.id)).rejects.toMatchObject({ code: 'INTEGRITY' })
  })

  it('enforces CAPS.reports (20 per project)', async () => {
    const project = await seedProject()
    const now = new Date().toISOString()
    const seeds = Array.from({ length: CAPS.reports }, (_, i) => ({
      id: `seed-report-${i}`,
      projectId: project.id,
      title: `预置报告 ${i}`,
      content: '',
      generatedAt: null,
      generatedSections: [],
      createdAt: now,
      updatedAt: now,
    }))
    await db.reports.bulkPut(seeds)

    await expect(applyReportDraft(project.id, validDraft)).rejects.toMatchObject({ code: 'CAPACITY_LIMIT' })
  })
})
