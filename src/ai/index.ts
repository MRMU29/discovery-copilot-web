import { AIError } from './errors'
import { GeminiProvider } from './providers/gemini'
import { OpenAICompatibleProvider, type AdapterDeps } from './providers/openai-compatible'
import type { AIProvider, ProviderConfig } from './types'

export { OpenAICompatibleProvider, type AdapterDeps } from './providers/openai-compatible'
export { GeminiProvider } from './providers/gemini'
export { estimateTokens, estimateMessagesTokens, computeCost, estimateCostUsd } from './tokens'
export type { CostEstimate } from './tokens'
export {
  registerPrompt,
  getPrompt,
  latestPromptVersion,
  CHAT_PROMPT,
  JSON_CHAT_PROMPT,
  IDENTIFY_ASSUMPTIONS_PROMPT,
} from './prompts'
export {
  setSessionKey,
  getSessionKey,
  hasSessionKey,
  clearSessionKeys,
  deleteSessionKey,
} from './session'
export { AIError, classifyAIError, userMessage } from './errors'
export type { AIErrorCode } from './errors'
export { assertWithinBudget } from './budget'
export { resolvePricing, PRICING_VERSION } from './pricing'
export { getMonthUsage, recordAiRequest, summarizeUsage } from './usage'
export { runAi } from './run'
export type { RunAiOptions } from './run'
export type {
  AIProvider,
  BudgetGuard,
  ChatMessage,
  GenerateJSONResult,
  GenerateOptions,
  GenerateTextResult,
  ProviderConfig,
  ProviderKind,
  TokenPricing,
  Usage,
} from './types'
export { DEFAULT_TIMEOUT_MS } from './types'

/** Factory: adapters isolate endpoint/auth/format differences (§6.1). */
export function createProvider(config: ProviderConfig, deps: AdapterDeps): AIProvider {
  switch (config.kind) {
    case 'openai-compatible':
      return new OpenAICompatibleProvider(config, deps)
    case 'gemini':
      return new GeminiProvider(config, deps)
    default:
      throw new AIError('UNKNOWN', `未知的 Provider 类型: ${(config as ProviderConfig).kind}`)
  }
}
