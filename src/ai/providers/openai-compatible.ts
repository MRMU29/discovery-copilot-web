import { z } from 'zod'
import { AIError } from '../errors'
import { getPrompt } from '../prompts'
import type {
  AIProvider,
  GenerateJSONResult,
  GenerateOptions,
  GenerateTextResult,
  ProviderConfig,
} from '../types'
import { DEFAULT_TIMEOUT_MS } from '../types'
import { extractJson, requestJson } from './http'

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export interface AdapterDeps {
  /** Injectable for tests; production uses global fetch. */
  fetchImpl?: typeof fetch
  /** Keys live in the session store (§6.3) — adapters never persist them. */
  getApiKey: () => string | null
  timeoutMs?: number
}

function requireKey(deps: AdapterDeps): string {
  const key = deps.getApiKey()
  if (!key) {
    throw new AIError('NOT_CONFIGURED', '该 Provider 尚未在会话中提供 API Key（设置 → AI Provider）。')
  }
  return key
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` }
}

/** OpenAI-compatible chat adapter (covers DeepSeek / Kimi / GLM / OpenAI itself). */
export class OpenAICompatibleProvider implements AIProvider {
  readonly config: ProviderConfig
  private readonly deps: AdapterDeps

  constructor(config: ProviderConfig, deps: AdapterDeps) {
    this.config = config
    this.deps = deps
  }

  private base(): string {
    return this.config.baseUrl.replace(/\/+$/, '')
  }

  async testConnection(signal?: AbortSignal): Promise<void> {
    await requestJson({
      url: `${this.base()}/models`,
      headers: authHeaders(requireKey(this.deps)),
      signal,
      timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: this.deps.fetchImpl,
    })
  }

  async generateText(options: GenerateOptions): Promise<GenerateTextResult> {
    const system = options.systemPrompt ?? getPrompt('chat', '1.0.0').template
    const messages = [
      { role: 'system' as const, content: system },
      ...options.messages,
    ]
    const { data } = await requestJson<OpenAIChatResponse>({
      url: `${this.base()}/chat/completions`,
      headers: { ...authHeaders(requireKey(this.deps)), 'Content-Type': 'application/json' },
      body: {
        model: this.config.model,
        messages,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      },
      signal: options.signal,
      timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: this.deps.fetchImpl,
    })
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new AIError('PARSE', '响应缺少 choices[0].message.content')
    return {
      text,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    }
  }

  async generateJSON<T>(options: GenerateOptions, schema: z.ZodType<T>): Promise<GenerateJSONResult<T>> {
    const jsonSystem = options.systemPrompt ?? getPrompt('chat-json', '1.0.0').template
    let messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: jsonSystem },
      ...options.messages,
    ]
    let lastUsage = { inputTokens: 0, outputTokens: 0 }

    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data } = await requestJson<OpenAIChatResponse>({
        url: `${this.base()}/chat/completions`,
        headers: { ...authHeaders(requireKey(this.deps)), 'Content-Type': 'application/json' },
        body: {
          model: this.config.model,
          messages,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
          response_format: { type: 'json_object' },
        },
        signal: options.signal,
        timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        fetchImpl: this.deps.fetchImpl,
      })
      const raw = data.choices?.[0]?.message?.content
      if (typeof raw !== 'string') throw new AIError('PARSE', '响应缺少 choices[0].message.content')
      lastUsage = {
        inputTokens: lastUsage.inputTokens + (data.usage?.prompt_tokens ?? 0),
        outputTokens: lastUsage.outputTokens + (data.usage?.completion_tokens ?? 0),
      }
      try {
        const parsed = schema.parse(extractJson(raw))
        return { data: parsed, usage: lastUsage, attempts: attempt }
      } catch (err) {
        if (attempt === 2) break
        const detail =
          err instanceof z.ZodError
            ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : 'JSON 解析失败'
        messages = [
          ...messages,
          { role: 'assistant' as const, content: raw },
          {
            role: 'user' as const,
            content: `上面的输出未通过校验（${detail}）。只输出修正后的 JSON 对象，不要任何解释或代码块。`,
          },
        ]
      }
    }
    throw new AIError('PARSE', 'AI 输出两次均未通过 Schema 校验')
  }
}
