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
import type { AdapterDeps } from './openai-compatible'

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

/**
 * Gemini-style adapter. The API key travels as a query parameter (Google's
 * auth scheme) — therefore the FULL URL must never be logged or persisted
 * (§6.3: key 不出现在 URL/日志); only providerId/model/usage reach storage.
 */
export class GeminiProvider implements AIProvider {
  readonly config: ProviderConfig
  private readonly deps: AdapterDeps

  constructor(config: ProviderConfig, deps: AdapterDeps) {
    this.config = config
    this.deps = deps
  }

  private url(path: string): string {
    const base = this.config.baseUrl.replace(/\/+$/, '')
    // Path may already carry its own query (e.g. models?pageSize=1) — join with & then.
    const joiner = path.includes('?') ? '&' : '?'
    return `${base}/v1beta/${path}${joiner}key=${requireKey(this.deps)}`
  }

  async testConnection(signal?: AbortSignal): Promise<void> {
    await requestJson({
      url: this.url('models?pageSize=1'),
      headers: {},
      signal,
      timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: this.deps.fetchImpl,
    })
  }

  private contents(options: GenerateOptions) {
    const system = options.messages.filter((m) => m.role === 'system').map((m) => m.content)
    const turns = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    return {
      ...(system.length > 0 ? { systemInstruction: { parts: [{ text: system.join('\n\n') }] } } : {}),
      contents: turns,
    }
  }

  private usageOf(data: GeminiResponse) {
    return {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    }
  }

  async generateText(options: GenerateOptions): Promise<GenerateTextResult> {
    const system = options.systemPrompt ?? getPrompt('chat', '1.0.0').template
    const { data } = await requestJson<GeminiResponse>({
      url: this.url(`models/${this.config.model}:generateContent`),
      headers: { 'Content-Type': 'application/json' },
      body: {
        ...this.contents({ ...options, messages: [{ role: 'system', content: system }, ...options.messages] }),
        generationConfig: {
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
        },
      },
      signal: options.signal,
      timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchImpl: this.deps.fetchImpl,
    })
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    if (!text) throw new AIError('PARSE', '响应缺少 candidates[0].content 文本')
    return { text, usage: this.usageOf(data) }
  }

  async generateJSON<T>(options: GenerateOptions, schema: z.ZodType<T>): Promise<GenerateJSONResult<T>> {
    const jsonSystem = options.systemPrompt ?? getPrompt('chat-json', '1.0.0').template
    const messages: ChatMessage[] = [{ role: 'system', content: jsonSystem }, ...options.messages]
    return runJsonRepairLoop<T>({
      schema,
      messages,
      attempt: async (attemptMessages) => {
        const { data } = await requestJson<GeminiResponse>({
          url: this.url(`models/${this.config.model}:generateContent`),
          headers: { 'Content-Type': 'application/json' },
          body: {
            ...this.contents({ ...options, messages: attemptMessages }),
            generationConfig: {
              ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
              ...(options.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
              responseMimeType: 'application/json',
            },
          },
          signal: options.signal,
          timeoutMs: this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          fetchImpl: this.deps.fetchImpl,
        })
        const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
        return {
          raw,
          usage: {
            inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
          },
        }
      },
    })
  }
}

function requireKey(deps: AdapterDeps): string {
  const key = deps.getApiKey()
  if (!key) {
    throw new AIError('NOT_CONFIGURED', '该 Provider 尚未在会话中提供 API Key（设置 → AI Provider）。')
  }
  return key
}
