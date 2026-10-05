import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AIError } from '@/ai/errors'
import { GeminiProvider, OpenAICompatibleProvider, createProvider } from '@/ai'
import type { AdapterDeps } from '@/ai/providers/openai-compatible'
import type { ProviderConfig } from '@/ai/types'
import { extractJson } from '@/ai/providers/http'

/**
 * Command 11 coverage gap fill: the Gemini adapter had no direct tests
 * (only partial reach through createProvider), and http.ts's extractJson
 * failure branch was untested. No network — every case runs on scripted
 * fetchImpl, mirroring the integration harness. Pure unit: no IndexedDB.
 */

interface ScriptedResponse {
  status: number
  body: unknown
  raw?: string
}

function mockFetch(responses: ScriptedResponse[]) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const next = responses.shift()
    if (!next) throw new Error('no scripted response left')
    if (next.raw !== undefined) {
      return new Response(next.raw, { status: next.status, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

const config: ProviderConfig = {
  id: 'prov-gemini',
  label: 'Gemini',
  kind: 'gemini',
  baseUrl: 'https://generativelanguage.test/',
  model: 'gemini-2.0-flash',
  createdAt: '2026-10-05T00:00:00.000Z',
}

function makeProvider(fetchImpl: typeof fetch): GeminiProvider {
  const deps: AdapterDeps = { fetchImpl, getApiKey: () => 'g-key' }
  return new GeminiProvider(config, deps)
}

const geminiReply = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 },
})

const draftSchema = z.object({ title: z.string() })

describe('GeminiProvider', () => {
  it('builds keyed URLs and strips the key from nothing it stores', async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: { models: [] } }])
    const provider = makeProvider(fetchImpl)
    await provider.testConnection()
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://generativelanguage.test/v1beta/models?pageSize=1&key=g-key')
  })

  it('throws NOT_CONFIGURED before any request when the session key is missing', async () => {
    const { fetchImpl, calls } = mockFetch([])
    const provider = new GeminiProvider(config, { fetchImpl, getApiKey: () => '' })
    await expect(provider.generateText({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    })
    expect(calls).toHaveLength(0)
  })

  it('maps generateText: system instruction, model role, usage and parts join', async () => {
    const { fetchImpl, calls } = mockFetch([{ status: 200, body: geminiReply('你好') }])
    const provider = makeProvider(fetchImpl)
    const result = await provider.generateText({
      systemPrompt: '系统指令',
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '上一轮' },
      ],
      temperature: 0.5,
      maxTokens: 512,
    })
    expect(result.text).toBe('你好')
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 80 })

    const body = JSON.parse(String(calls[0]!.init?.body))
    expect(body.systemInstruction).toEqual({ parts: [{ text: '系统指令' }] })
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: '问题' }] },
      { role: 'model', parts: [{ text: '上一轮' }] },
    ])
    expect(body.generationConfig).toEqual({ temperature: 0.5, maxOutputTokens: 512 })
  })

  it('throws PARSE when generateText returns no candidate text', async () => {
    const { fetchImpl } = mockFetch([{ status: 200, body: { candidates: [] } }])
    const provider = makeProvider(fetchImpl)
    await expect(provider.generateText({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toMatchObject({
      code: 'PARSE',
    })
  })

  it('generateJSON succeeds with responseMimeType and schema parse', async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: geminiReply('{"title":"报告"}') },
    ])
    const provider = makeProvider(fetchImpl)
    const result = await provider.generateJSON(
      { messages: [{ role: 'user', content: '写标题' }] },
      draftSchema,
    )
    expect(result).toMatchObject({ data: { title: '报告' }, attempts: 1 })
    const body = JSON.parse(String(calls[0]!.init?.body))
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })

  it('repairs once on schema failure and aggregates usage across attempts', async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: geminiReply('{"title":"') },
      { status: 200, body: geminiReply('{"title":"修复"}') },
    ])
    const provider = makeProvider(fetchImpl)
    const result = await provider.generateJSON(
      { messages: [{ role: 'user', content: '写标题' }] },
      draftSchema,
    )
    expect(result.data).toEqual({ title: '修复' })
    expect(result.attempts).toBe(2)
    expect(result.usage.inputTokens).toBe(240) // 120 + 120
    expect(calls).toHaveLength(2)
    const repairBody = JSON.parse(String(calls[1]!.init?.body))
    expect(repairBody.contents.at(-1).role).toBe('user')
    expect(repairBody.contents.at(-1).parts[0].text).toContain('未通过校验')
  })

  it('throws PARSE after two failed JSON attempts', async () => {
    const { fetchImpl } = mockFetch([
      { status: 200, body: geminiReply('不是 JSON') },
      { status: 200, body: geminiReply('还不是 JSON') },
    ])
    const provider = makeProvider(fetchImpl)
    await expect(
      provider.generateJSON({ messages: [{ role: 'user', content: 'x' }] }, draftSchema),
    ).rejects.toMatchObject({ code: 'PARSE' })
  })

  it('propagates classified HTTP errors from the shared transport', async () => {
    const { fetchImpl } = mockFetch([{ status: 401, body: { error: { message: 'bad key' } } }])
    const provider = makeProvider(fetchImpl)
    await expect(provider.testConnection()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('createProvider factory', () => {
  it('routes kinds to adapters and rejects unknown ones', () => {
    const deps: AdapterDeps = { fetchImpl: globalThis.fetch, getApiKey: () => 'k' }
    expect(createProvider({ ...config, kind: 'gemini' }, deps)).toBeInstanceOf(GeminiProvider)
    expect(
      createProvider({ ...config, kind: 'openai-compatible', id: 'prov-oai' }, deps),
    ).toBeInstanceOf(OpenAICompatibleProvider)
    expect(() => createProvider({ ...config, kind: 'alien' as never }, deps)).toThrow(AIError)
  })
})

describe('extractJson (http.ts)', () => {
  it('parses fenced and sandwiched JSON', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('好的，结果如下：{"a":{"b":2}} 请查收')).toEqual({ a: { b: 2 } })
  })

  it('throws when no JSON object exists', () => {
    expect(() => extractJson('完全不是 JSON 的回复')).toThrowError('no JSON object')
  })
})
