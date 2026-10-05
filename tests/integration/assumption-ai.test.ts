import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { OpenAICompatibleProvider, type AdapterDeps } from '@/ai/providers/openai-compatible'
import type { ProviderConfig } from '@/ai/types'
import { db, resetDb } from '@/db/db'
import { scoreEventsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import { ASSUMPTION_TYPES } from '@/schemas/entities'
import {
  applyIdentifiedAssumptions,
  identifyAssumptions,
  identifyResultSchema,
  type IdentifiedAssumption,
} from '@/services/assumption-ai'
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
  id: 'prov-identify',
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
    usage: { prompt_tokens: 120, completion_tokens: 200 },
  },
})

const validPayload = {
  assumptions: [
    {
      statement: '自由职业者愿意为自动报税整理支付每月 10 元',
      type: 'value' as const,
      rationale: '付费意愿完全未经验证，决定商业可行性',
      suggestedImpact: 4,
      suggestedRisk: 4,
    },
    {
      statement: '目标用户能在 3 分钟内完成首次发票导入',
      type: 'usability' as const,
      rationale: '上手流失率未知',
      suggestedImpact: 3,
      suggestedRisk: 3,
    },
    {
      statement: 'AI 分类 API 成本能控制在每用户每月 1 元以内',
      type: 'viability' as const,
      rationale: '单位经济模型未验证',
      suggestedImpact: 4,
      suggestedRisk: 2,
    },
  ],
}

const CONTEXT = '面向自由职业者的 AI 记账助手：自动导入发票、分类支出、生成报税草稿。目标用户每月开票 20–100 张。'

describe('identifyResultSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(identifyResultSchema.safeParse(validPayload).success).toBe(true)
  })

  it('rejects wrong types, empty lists and out-of-range scores', () => {
    expect(identifyResultSchema.safeParse({ assumptions: [] }).success).toBe(false)
    expect(
      identifyResultSchema.safeParse({ assumptions: [{ ...validPayload.assumptions[0], type: 'foo' }] }).success,
    ).toBe(false)
    expect(
      identifyResultSchema.safeParse({ assumptions: [{ ...validPayload.assumptions[0], suggestedImpact: 6 }] })
        .success,
    ).toBe(false)
    expect(identifyResultSchema.safeParse({ assumptions: [{ statement: '短' }] }).success).toBe(false)
  })
})

describe('identifyAssumptions (command 5)', () => {
  it('rejects a too-short context before any request', async () => {
    const { fetchImpl, calls } = mockFetch([])
    await expect(identifyAssumptions(makeProvider(fetchImpl), { context: '太短' })).rejects.toThrowError()
    expect(calls).toHaveLength(0)
  })

  it('parses a fenced AI reply and repairs once when the first output fails schema', async () => {
    const project = await createProject({ name: 'AI 记账' })
    const { fetchImpl, calls } = mockFetch([
      okChat('```json\n{"assumptions":"oops"}\n```'),
      okChat(JSON.stringify(validPayload)),
    ])
    const result = await identifyAssumptions(makeProvider(fetchImpl), {
      projectId: project.id,
      projectName: project.name,
      context: CONTEXT,
    })

    expect(result.data).toHaveLength(3)
    expect(result.attempts).toBe(2)
    expect(calls).toHaveLength(2)
    // The repair turn carries the system prompt override, not the chat-json default.
    const secondBody = JSON.parse(String(calls[1].init?.body))
    expect(secondBody.messages[0].role).toBe('system')
    expect(secondBody.messages[0].content).toContain('八个风险类别')

    // Usage ledger records the feature prompt id/version (§6.4).
    const requests = await db.ai_requests.toArray()
    expect(requests).toHaveLength(1)
    expect(requests[0].promptId).toBe('identify-assumptions')
    expect(requests[0].promptVersion).toBe('1.0.0')
    expect(requests[0].kind).toBe('json')
    expect(requests[0].status).toBe('ok')
  })

  it('throws PARSE after two invalid outputs', async () => {
    const { fetchImpl } = mockFetch([okChat('不是 JSON'), okChat('{"assumptions":[]}')])
    await expect(
      identifyAssumptions(makeProvider(fetchImpl), { context: CONTEXT }),
    ).rejects.toMatchObject({ code: 'PARSE' })
  })

  it('maps a user abort to ABORTED', async () => {
    const { fetchImpl } = mockFetch([])
    const controller = new AbortController()
    controller.abort()
    await expect(
      identifyAssumptions(makeProvider(fetchImpl), { context: CONTEXT, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' })
  })
})

describe('applyIdentifiedAssumptions (command 5)', () => {
  it('persists reviewed picks with ai-suggestion audit and null confidence', async () => {
    const project = await createProject({ name: 'AI 记账' })
    const picks: IdentifiedAssumption[] = validPayload.assumptions.map((a) => ({ ...a }))

    const applied = await applyIdentifiedAssumptions(project.id, picks)
    expect(applied).toEqual({ created: 3, skipped: 0 })

    const rows = await db.assumptions.where('projectId').equals(project.id).toArray()
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(ASSUMPTION_TYPES).toContain(row.type)
      expect(row.confidence).toBeNull()
    }
    const first = rows.find((r) => r.statement === validPayload.assumptions[0].statement)
    expect(first).toBeTruthy()
    expect(first!.impact).toBe(4)
    expect(first!.risk).toBe(4)
    expect(first!.priorityScore).toBe(16) // 4 × 4 × (1 − 0)

    const events = await scoreEventsRepo.byAssumption(first!.id)
    expect(events).toHaveLength(1)
    expect(events[0].changedBy).toBe('ai-suggestion')
    expect(events[0].before).toBeNull()
    expect(events[0].after.priorityScore).toBe(16)
  })

  it('caps the batch at the remaining project capacity', async () => {
    const project = await createProject({ name: '容量边界' })
    const now = new Date().toISOString()
    const seeds = Array.from({ length: CAPS.assumptions - 2 }, (_, i) => ({
      id: `seed-${i}`,
      projectId: project.id,
      type: 'value' as const,
      statement: `预置假设 ${i}`,
      impact: 1,
      risk: 1,
      confidence: null,
      priorityScore: 1,
      status: 'open' as const,
      createdAt: now,
      updatedAt: now,
    }))
    await db.assumptions.bulkPut(seeds)

    const picks: IdentifiedAssumption[] = validPayload.assumptions.map((a) => ({ ...a }))
    const applied = await applyIdentifiedAssumptions(project.id, picks)
    expect(applied).toEqual({ created: 2, skipped: 1 })
    expect(await db.assumptions.where('projectId').equals(project.id).count()).toBe(CAPS.assumptions)
  })
})
