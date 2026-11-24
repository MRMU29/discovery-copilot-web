import { z } from 'zod'
import { AIError } from '../errors'
import { getPrompt } from '../prompts'
import type {
  AIProvider,
  ChatMessage,
  GenerateJSONResult,
  GenerateOptions,
  GenerateTextResult,
  ProviderConfig,
} from '../types'
import { DEFAULT_TIMEOUT_MS } from '../types'
import { requestJson } from './http'
import { runJsonRepairLoop } from './json-repair'

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
    const messages: ChatMessage[] = [{ role: 'system', content: jsonSystem }, ...options.messages]
    return runJsonRepairLoop<T>({
      schema,
      messages,
      attempt: async (attemptMessages) => {
        const { data } = await requestJson<OpenAIChatResponse>({
          url: `${this.base()}/chat/completions`,
          headers: { ...authHeaders(requireKey(this.deps)), 'Content-Type': 'application/json' },
          body: {
            model: this.config.model,
            messages: attemptMessages,
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
        return {
          raw,
          usage: {
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
          },
        }
      },
    })
  }
}
