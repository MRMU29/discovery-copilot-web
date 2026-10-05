import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider, type AdapterDeps } from '@/ai/providers/openai-compatible'
import { buildExperimentPrompt } from '@/ai/prompts/builders'
import type { ProviderConfig } from '@/ai/types'
import { db, resetDb } from '@/db/db'
import { CAPS } from '@/lib/limits'
import { parseRelayResult } from '@/ai/relay/parse'
import {
  applySuggestedExperiments,
  experimentSuggestionSchema,
  suggestExperiments,
  type SuggestedExperiment,
} from '@/services/experiment-ai'
import { createAssumption } from '@/services/assumptions'
import { createProject } from '@/services/projects'

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
  id: 'prov-experiment',
  label: 'DeepSeek',
  kind: 'openai-compatible',
  baseUrl: 'https://api.test/v1',
  model: 'deepseek-chat',
  createdAt: '2026-10-03T00:00:00.000Z',
}

function makeProvider(fetchImpl: typeof fetch) {
  return new OpenAICompatibleProvider(config, { fetchImpl, getApiKey: () => 'sk-test' } satisfies AdapterDeps)
}

const okChat = (content: string) => ({
  status: 200,
  body: {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 220, completion_tokens: 300 },
  },
})

const validPayload = {
  experiments: [
    {
      hypothesis: '若提供一键导入模板，则 60% 以上用户能在 5 分钟内完成首次导入',
      method: '假门测试：引导页放置「一键导入」入口，运行 7 天记录展示与点击',
      successCriteria: '入口点击率 ≥ 25%',
    },
    {
      hypothesis: '若由人工 24 小时内交付首次对账结果，则 10 家试用用户中 6 家愿意付费',
      method: 'Wizard of Oz：人工模拟自动对账服务，观察实际付款',
      successCriteria: '10 家中 ≥ 6 家完成付费转化',
    },
    {
      hypothesis: '浏览器解析 10 万行流水耗时 ≤ 3 秒',
      method: '技术尖刺：3 天构建解析原型，测 1 万 / 5 万 / 10 万行耗时',
      successCriteria: '10 万行解析耗时 ≤ 3 秒',
    },
  ],
}

const ASSUMPTION = {
  statement: '自由职业者愿意为自动报税整理支付每月 10 元',
  type: 'value' as const,
  impact: 4,
  risk: 4,
  confidence: null,
}

async function seedProjectWithAssumption() {
  const project = await createProject({ name: 'AI 记账' })
  const assumption = await createAssumption(project.id, {
    statement: ASSUMPTION.statement,
    type: ASSUMPTION.type,
    impact: ASSUMPTION.impact,
    risk: ASSUMPTION.risk,
    confidence: null,
  })
  return { project, assumption }
}

describe('suggestExperiments (command 6, BYOK)', () => {
  it('parses a fenced reply into flattened suggestions and records the ledger row', async () => {
    const { project, assumption } = await seedProjectWithAssumption()
    const { fetchImpl } = mockFetch([okChat('```json\n' + JSON.stringify(validPayload) + '\n```')])

    const result = await suggestExperiments(makeProvider(fetchImpl), {
      projectId: project.id,
      projectName: project.name,
      assumption: ASSUMPTION,
      context: '只有网页端，希望一周内得到结论',
    })

    expect(result.data).toHaveLength(3)
    expect(result.data[0].hypothesis).toContain('一键导入')
    expect(result.attempts).toBe(1)

    const requests = await db.ai_requests.toArray()
    expect(requests).toHaveLength(1)
    expect(requests[0].promptId).toBe('design-experiments')
    expect(requests[0].promptVersion).toBe('1.0.0')
    expect(requests[0].kind).toBe('json')
    expect(requests[0].status).toBe('ok')
    expect(requests[0].projectId).toBe(project.id)
    expect(assumption.id).toBeTruthy()
  })

  it('rejects a too-short suggestion payload and retries once before PARSE', async () => {
    await seedProjectWithAssumption()
    const { fetchImpl } = mockFetch([okChat('{"experiments":[]}'), okChat('{"experiments":[]}')])
    await expect(suggestExperiments(makeProvider(fetchImpl), { assumption: ASSUMPTION })).rejects.toMatchObject({
      code: 'PARSE',
    })
  })
})

describe('applySuggestedExperiments (command 6)', () => {
  it('persists reviewed picks linked to the assumption', async () => {
    const { project, assumption } = await seedProjectWithAssumption()

    const applied = await applySuggestedExperiments(project.id, assumption.id, validPayload.experiments)
    expect(applied).toEqual({ created: 3, skipped: 0 })

    const rows = await db.experiments.where('projectId').equals(project.id).toArray()
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.assumptionId).toBe(assumption.id)
      expect(row.status).toBe('planned')
      expect(row.successCriteria).toMatch(/[≥≤]|\d/)
    }
  })

  it('caps the batch at the remaining project capacity', async () => {
    const { project, assumption } = await seedProjectWithAssumption()
    const now = new Date().toISOString()
    const seeds = Array.from({ length: CAPS.experiments - 1 }, (_, i) => ({
      id: `seed-${i}`,
      projectId: project.id,
      assumptionId: null,
      hypothesis: `预置实验 ${i}`,
      method: '预置方法',
      successCriteria: null,
      status: 'planned' as const,
      result: null,
      createdAt: now,
      updatedAt: now,
    }))
    await db.experiments.bulkPut(seeds)

    const applied = await applySuggestedExperiments(project.id, assumption.id, validPayload.experiments)
    expect(applied).toEqual({ created: 1, skipped: 2 })
    expect(await db.experiments.where('projectId').equals(project.id).count()).toBe(CAPS.experiments)
  })
})

describe('relay path equivalence (command 6)', () => {
  it('buildExperimentPrompt → pasted result → parseRelayResult → apply lands identical rows', async () => {
    const { project, assumption } = await seedProjectWithAssumption()

    const bundle = buildExperimentPrompt({ projectName: project.name, assumption: ASSUMPTION })
    expect(bundle.relayText).toContain(ASSUMPTION.statement)

    // 外部 agent 的典型回复：前后解释文字 + markdown 围栏 + snake_case 字段。
    const relayed = [
      '这是我为你设计的验证实验：',
      '```json',
      JSON.stringify({
        Experiments: validPayload.experiments.map((e) => ({
          Hypothesis: e.hypothesis,
          Method: e.method,
          success_criteria: e.successCriteria,
        })),
      }),
      '```',
      '如需调整请告诉我。',
    ].join('\n')

    const parsed = parseRelayResult(relayed, experimentSuggestionSchema)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const picks: SuggestedExperiment[] = parsed.data.experiments
    const applied = await applySuggestedExperiments(project.id, assumption.id, picks)
    expect(applied).toEqual({ created: 3, skipped: 0 })

    const rows = await db.experiments.where('projectId').equals(project.id).toArray()
    expect(rows.map((r) => r.hypothesis)).toContain(validPayload.experiments[0].hypothesis)

    // Relay 路径不产生任何 AI 请求账本（纯本地，无 Key 参与）。
    expect(await db.ai_requests.count()).toBe(0)
  })
})
