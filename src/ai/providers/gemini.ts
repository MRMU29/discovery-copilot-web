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
    let messages: GenerateOptions['messages'] = [{ role: 'system', content: jsonSystem }, ...options.messages]
    let lastUsage = { inputTokens: 0, outputTokens: 0 }

    for (let attempt = 1; attempt <= 2; attempt++) {
      const { data } = await requestJson<GeminiResponse>({
        url: this.url(`models/${this.config.model}:generateContent`),
        headers: { 'Content-Type': 'application/json' },
        body: {
          ...this.contents({ ...options, messages }),
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
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      lastUsage = {
        inputTokens: lastUsage.inputTokens + (data.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: lastUsage.outputTokens + (data.usageMetadata?.candidatesTokenCount ?? 0),
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
          { role: 'assistant', content: raw },
          {
            role: 'user',
            content: `上面的输出未通过校验（${detail}）。只输出修正后的 JSON 对象，不要任何解释或代码块。`,
          },
        ]
      }
    }
    throw new AIError('PARSE', 'AI 输出两次均未通过 Schema 校验')
  }
}

function requireKey(deps: AdapterDeps): string {
  const key = deps.getApiKey()
  if (!key) {
    throw new AIError('NOT_CONFIGURED', '该 Provider 尚未在会话中提供 API Key（设置 → AI Provider）。')
  }
  return key
}
