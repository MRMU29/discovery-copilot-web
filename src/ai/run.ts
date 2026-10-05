import type { z } from 'zod'
import { assertWithinBudget } from './budget'
import { classifyAIError } from './errors'
import { nowIso } from '@/lib/clock'
import { computeCost, estimateCostUsd, estimateMessagesTokens } from './tokens'
import type {
  AIProvider,
  GenerateJSONResult,
  GenerateOptions,
  GenerateTextResult,
  TokenPricing,
} from './types'
import { recordAiRequest } from './usage'

export interface RunAiOptions extends GenerateOptions {
  kind: 'text' | 'json'
  /** Required when kind = 'json'. */
  schema?: z.ZodType<unknown>
  /** Usage-ledger overrides for feature prompts; defaults: chat / chat-json v1.0.0. */
  promptId?: string
  promptVersion?: string
  projectId?: string
  /** §6.4 熔断确认后的绕过标记（单次有效）。 */
  budgetConfirmed?: boolean
  pricing?: TokenPricing
}

/**
 * Orchestrates one AI call: budget pre-check → provider call → usage row
 * (§6.4). Usage logging never masks the original error; every attempt — ok
 * or failed — lands in ai_requests with its prompt version and cost estimate.
 */
export async function runAi<T>(
  provider: AIProvider,
  options: RunAiOptions & { kind: 'json'; schema: z.ZodType<T> },
): Promise<GenerateJSONResult<T>>
export async function runAi(
  provider: AIProvider,
  options: RunAiOptions & { kind: 'text' },
): Promise<GenerateTextResult>
export async function runAi(
  provider: AIProvider,
  options: RunAiOptions,
): Promise<GenerateTextResult | GenerateJSONResult<unknown>> {
  const started = Date.now()
  if (options.pricing) {
    const estimated = estimateCostUsd(
      estimateMessagesTokens(options.messages),
      options.maxTokens ?? 1024,
      options.pricing,
    )
    await assertWithinBudget(estimated, { confirmed: options.budgetConfirmed })
  }

  try {
    const result =
      options.kind === 'json'
        ? await provider.generateJSON(options, options.schema!)
        : await provider.generateText(options)
    const cost = options.pricing ? computeCost(result.usage, options.pricing) : null
    await recordAiRequest({
      providerId: provider.config.id,
      projectId: options.projectId ?? null,
      model: provider.config.model,
      kind: options.kind,
      promptId: options.promptId ?? (options.kind === 'json' ? 'chat-json' : 'chat'),
      promptVersion: options.promptVersion ?? '1.0.0',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      estimatedUsd: cost?.totalUsd ?? null,
      status: 'ok',
      errorCode: null,
      durationMs: Date.now() - started,
      createdAt: nowIso(),
    })
    return result
  } catch (err) {
    const aiError = classifyAIError(err)
    try {
      await recordAiRequest({
        providerId: provider.config.id,
        projectId: options.projectId ?? null,
        model: provider.config.model,
        kind: options.kind,
        promptId: options.promptId ?? (options.kind === 'json' ? 'chat-json' : 'chat'),
        promptVersion: options.promptVersion ?? '1.0.0',
        inputTokens: 0,
        outputTokens: 0,
        estimatedUsd: null,
        status: 'error',
        errorCode: aiError.code,
        durationMs: Date.now() - started,
        createdAt: nowIso(),
      })
    } catch {
      // usage logging must never mask the original error
    }
    throw aiError
  }
}
