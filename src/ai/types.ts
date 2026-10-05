import type { z } from 'zod'

/**
 * Provider-neutral AI contract (plan v2.1 §6.1). Adapters isolate endpoint,
 * auth, request/response format differences; callers only see these types.
 */

export type ProviderKind = 'openai-compatible' | 'gemini'

/** Non-secret provider configuration — persisted in Dexie `ai_providers`. */
export interface ProviderConfig {
  id: string
  label: string
  kind: ProviderKind
  /** e.g. https://api.deepseek.com/v1 — no trailing slash, no key. */
  baseUrl: string
  model: string
  createdAt: string
}

export interface Usage {
  inputTokens: number
  outputTokens: number
}

export interface TokenPricing {
  /** USD per 1M input tokens. */
  inputPerMillionUsd: number
  /** USD per 1M output tokens. */
  outputPerMillionUsd: number
  currency: 'USD'
  /** Pricing table version + date — surfaced in usage views (§6.4 计费口径标注). */
  pricingVersion: string
  pricingUpdatedAt: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GenerateOptions {
  messages: ChatMessage[]
  /** Overrides the adapter's default system prompt (versioned in src/ai/prompts). */
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  /** User-cancel or timeout signal. */
  signal?: AbortSignal
}

export interface GenerateTextResult {
  text: string
  usage: Usage
}

export interface GenerateJSONResult<T> {
  data: T
  usage: Usage
  /** Number of parse/repair attempts consumed (1 = first try succeeded). */
  attempts: number
}

/** Token budget pre-check (§6.4 熔断). Throw AIError('BUDGET') to enter the confirm flow. */
export interface BudgetGuard {
  /** Estimated USD cost of the upcoming request, computed before it is sent. */
  estimateCostUsd(estimateInputTokens: number, maxOutputTokens: number): Promise<number>
  /** Throws AIError('BUDGET') when the per-request or monthly budget would be exceeded. */
  assertWithinBudget(estimatedUsd: number): Promise<void>
}

export interface AIProvider {
  readonly config: ProviderConfig
  /** Minimal authenticated call (models list or 1-token chat). Rejects AIError on failure. */
  testConnection(signal?: AbortSignal): Promise<void>
  generateText(options: GenerateOptions): Promise<GenerateTextResult>
  /** Structured output: adapter enforces JSON mode + one repair retry + schema validation. */
  generateJSON<T>(options: GenerateOptions, schema: z.ZodType<T>): Promise<GenerateJSONResult<T>>
}

export const DEFAULT_TIMEOUT_MS = 60_000
