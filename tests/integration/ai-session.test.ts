import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import 'fake-indexeddb/auto'
import { createProvider, runAi } from '@/ai'
import { AIError } from '@/ai/errors'
import { clearSessionKeys, setSessionKey } from '@/ai/session'
import type { TokenPricing } from '@/ai/types'
import { db, resetDb } from '@/db/db'
import type { ProviderConfig } from '@/ai/types'
import { updateSettings } from '@/services/settings'

beforeAll(async () => {
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

const openaiConfig: ProviderConfig = {
  id: 'prov-deepseek',
  label: 'DeepSeek',
  kind: 'openai-compatible',
  baseUrl: 'https://api.test/v1',
  model: 'deepseek-chat',
  createdAt: '2026-10-03T00:00:00.000Z',
}

const geminiConfig: ProviderConfig = {
  id: 'prov-gemini',
  label: 'Gemini',
  kind: 'gemini',
  baseUrl: 'https://gemini.test',
  model: 'gemini-2.0-flash',
  createdAt: '2026-10-03T00:00:00.000Z',
}

const pricing: TokenPricing = {
  inputPerMillionUsd: 2,
  outputPerMillionUsd: 8,
  currency: 'USD',
  pricingVersion: 'test-1',
  pricingUpdatedAt: '2026-10-01',
}

const okChat = (content: string, usage?: { prompt_tokens?: number; completion_tokens?: number }) => ({
  status: 200,
  body: { choices: [{ message: { content } }], usage },
})

describe('provider adapters — error classification (§6.2)', () => {
  it('testConnection resolves on 200', async () => {
    const { fetchImpl } = mockFetch([{ status: 200, body: { data: [] } }])
    setSessionKey(openaiConfig.id, 'sk-test')
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-test' })
    await expect(provider.testConnection()).resolves.toBeUndefined()
  })

  it('maps 401 → UNAUTHORIZED, 429 → RATE_LIMITED, TypeError → NETWORK', async () => {
    setSessionKey(openaiConfig.id, 'sk-bad')
    for (const [scripted, code] of [
      [{ status: 401, body: { error: 'bad key' } }, 'UNAUTHORIZED'],
      [{ status: 429, body: { error: 'slow down' } }, 'RATE_LIMITED'],
    ] as const) {
      const { fetchImpl } = mockFetch([scripted])
      const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-bad' })
      await expect(provider.testConnection()).rejects.toMatchObject({ code, status: scripted.status })
    }
    const provider = createProvider(openaiConfig, {
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch')
      }) as typeof fetch,
      getApiKey: () => 'sk-x',
    })
    await expect(provider.testConnection()).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('fails with NOT_CONFIGURED when the session has no key', async () => {
    clearSessionKeys()
    const { fetchImpl } = mockFetch([])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => null })
    await expect(provider.testConnection()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
  })
})

describe('runAi — usage ledger + repair retry (§6.4)', () => {
  it('records a successful text request with tokens and estimated cost', async () => {
    const { fetchImpl, calls } = mockFetch([okChat('你好', { prompt_tokens: 10, completion_tokens: 5 })])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    const result = await runAi(provider, {
      kind: 'text',
      messages: [{ role: 'user', content: '打个招呼' }],
      pricing,
      projectId: 'p-run-1',
    })
    expect(result.text).toBe('你好')
    const rows = await db.ai_requests.toArray()
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({
      providerId: 'prov-deepseek',
      projectId: 'p-run-1',
      model: 'deepseek-chat',
      kind: 'text',
      promptId: 'chat',
      promptVersion: '1.0.0',
      inputTokens: 10,
      outputTokens: 5,
      estimatedUsd: 0.00006, // 10/1M×2 + 5/1M×8
      status: 'ok',
    })
    expect(calls[0].url).toBe('https://api.test/v1/chat/completions')
  })

  it('repairs malformed JSON once and accumulates usage across attempts', async () => {
    const schema = z.object({ answer: z.number() })
    const { fetchImpl, calls } = mockFetch([
      okChat('```json\n{"wrong": true}\n```', { prompt_tokens: 10, completion_tokens: 5 }),
      okChat('{"answer": 42}', { prompt_tokens: 20, completion_tokens: 8 }),
    ])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    const result = await runAi(provider, {
      kind: 'json',
      schema,
      messages: [{ role: 'user', content: '给一个答案' }],
      pricing,
    })
    expect(result).toMatchObject({ data: { answer: 42 }, attempts: 2 })
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 13 })
    expect(calls).toHaveLength(2)
    // 修复重试的纠错消息进 body
    const secondBody = JSON.parse(String(calls[1].init?.body))
    expect(secondBody.response_format).toEqual({ type: 'json_object' })
    expect(secondBody.messages.at(-1).content).toContain('未通过校验')
  })

  it('surfaces PARSE after two failed attempts and logs the error row', async () => {
    const schema = z.object({ answer: z.number() })
    const { fetchImpl, calls } = mockFetch([okChat('not json at all'), okChat('still not json')])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    await expect(
      runAi(provider, { kind: 'json', schema, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'PARSE' })
    expect(calls).toHaveLength(2)
    const rows = await db.ai_requests.toArray()
    const errorRow = rows.find((r) => r.status === 'error')
    expect(errorRow).toMatchObject({ kind: 'json', errorCode: 'PARSE', estimatedUsd: null })
  })

  it('maps user abort to ABORTED and records the error row', async () => {
    const { fetchImpl } = mockFetch([])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    const controller = new AbortController()
    controller.abort()
    await expect(
      runAi(provider, {
        kind: 'text',
        messages: [{ role: 'user', content: 'x' }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' })
    expect((await db.ai_requests.toArray()).some((r) => r.errorCode === 'ABORTED')).toBe(true)
  })
})

describe('budget circuit breaker (§6.4)', () => {
  it('refuses when the estimate exceeds the per-request budget, allows confirmed bypass', async () => {
    await updateSettings({ perRequestBudgetUsd: 0.000001 })
    const before = await db.ai_requests.count()
    const { fetchImpl } = mockFetch([okChat('hi', { prompt_tokens: 10, completion_tokens: 5 })])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    await expect(
      runAi(provider, { kind: 'text', messages: [{ role: 'user', content: 'x' }], pricing }),
    ).rejects.toMatchObject({ code: 'BUDGET' })
    expect(await db.ai_requests.count()).toBe(before) // 熔断发生在请求前，无记录

    await expect(
      runAi(provider, {
        kind: 'text',
        messages: [{ role: 'user', content: 'x' }],
        pricing,
        budgetConfirmed: true,
      }),
    ).resolves.toMatchObject({ text: 'hi' })
    await updateSettings({ perRequestBudgetUsd: null })
  })

  it('refuses when the monthly total would exceed the monthly budget', async () => {
    await updateSettings({ monthlyBudgetUsd: 0.000001 })
    await db.ai_requests.add({
      providerId: 'prov-deepseek',
      projectId: null,
      model: 'deepseek-chat',
      kind: 'text',
      promptId: 'chat',
      promptVersion: '1.0.0',
      inputTokens: 1_000_000,
      outputTokens: 0,
      estimatedUsd: 2,
      status: 'ok',
      errorCode: null,
      durationMs: 1,
      createdAt: new Date().toISOString(),
    })
    const { fetchImpl } = mockFetch([okChat('hi')])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    await expect(
      runAi(provider, { kind: 'text', messages: [{ role: 'user', content: 'x' }], pricing }),
    ).rejects.toMatchObject({ code: 'BUDGET' })
    await updateSettings({ monthlyBudgetUsd: null })
  })

  it('wraps unknown throwables as AIError (never leaks raw errors)', async () => {
    const { fetchImpl } = mockFetch([{ status: 500, body: { error: 'boom' } }])
    const provider = createProvider(openaiConfig, { fetchImpl, getApiKey: () => 'sk-ok' })
    await expect(provider.testConnection()).rejects.toBeInstanceOf(AIError)
  })
})

describe('gemini adapter', () => {
  it('uses key-in-URL auth, JSON mime mode, usageMetadata — and never stores the URL', async () => {
    setSessionKey(geminiConfig.id, 'g-key')
    const { fetchImpl, calls } = mockFetch([
      {
        status: 200,
        body: {
          candidates: [{ content: { parts: [{ text: '{"answer": 7}' }] } }],
          usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
        },
      },
    ])
    const provider = createProvider(geminiConfig, { fetchImpl, getApiKey: () => 'g-key' })
    const result = await runAi(provider, {
      kind: 'json',
      schema: z.object({ answer: z.number() }),
      messages: [{ role: 'user', content: 'x' }],
      pricing,
    })
    expect(result).toMatchObject({ data: { answer: 7 }, attempts: 1 })
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3 })
    expect(calls[0].url).toContain('/v1beta/models/gemini-2.0-flash:generateContent?key=g-key')
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    const row = (await db.ai_requests.toArray()).at(-1)!
    expect(row).toMatchObject({ providerId: 'prov-gemini', status: 'ok', inputTokens: 7 })
    expect(Object.keys(row)).not.toContain('url') // key 永不入库（§6.3）
  })
})
