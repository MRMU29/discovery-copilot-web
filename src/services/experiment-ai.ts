import { z } from 'zod'
import type { ExperimentPromptAssumption } from '@/ai/prompts/builders'
import { buildExperimentPrompt } from '@/ai/prompts/builders'
import { resolvePricing } from '@/ai/pricing'
import { runAi } from '@/ai/run'
import type { AIProvider, GenerateJSONResult } from '@/ai/types'
import { experimentsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import { createExperiment } from './experiments'

/**
 * AI-side of experiment design: the model proposes 1–3 lean experiments for a
 * key assumption; everything lands in the review dialog before any row is
 * written. Same「AI 仅建议」discipline as assumption-ai.
 */

export const experimentSuggestionSchema = z.object({
  experiments: z
    .array(
      z.object({
        hypothesis: z.string().min(5).max(2000),
        method: z.string().min(1).max(1000),
        successCriteria: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(5),
})

export type SuggestedExperiment = z.infer<typeof experimentSuggestionSchema>['experiments'][number]

export interface SuggestExperimentsOptions {
  projectId?: string
  projectName?: string
  assumption: ExperimentPromptAssumption
  context?: string
  signal?: AbortSignal
  /** §6.4 熔断确认后的单次绕过（UI「本次继续」）。 */
  budgetConfirmed?: boolean
}

export async function suggestExperiments(
  provider: AIProvider,
  options: SuggestExperimentsOptions,
): Promise<GenerateJSONResult<SuggestedExperiment[]>> {
  const bundle = buildExperimentPrompt({
    projectName: options.projectName,
    assumption: options.assumption,
    context: options.context,
  })
  const result = await runAi(provider, {
    kind: 'json',
    schema: experimentSuggestionSchema,
    systemPrompt: bundle.instruction,
    promptId: 'design-experiments',
    promptVersion: bundle.version,
    messages: [{ role: 'user', content: bundle.inputBlock }],
    temperature: 0.7,
    maxTokens: 2048,
    pricing: resolvePricing(provider.config.model) ?? undefined,
    projectId: options.projectId,
    signal: options.signal,
    budgetConfirmed: options.budgetConfirmed,
  })
  // Flatten the envelope — callers only care about the list.
  return { data: result.data.experiments, usage: result.usage, attempts: result.attempts }
}

export interface ExperimentApplyResult {
  created: number
  skipped: number
}

/**
 * Persists user-reviewed experiments. Silently caps at the project's remaining
 * capacity instead of half-failing mid-batch (same as applyIdentifiedAssumptions).
 */
export async function applySuggestedExperiments(
  projectId: string,
  assumptionId: string | null,
  picks: SuggestedExperiment[],
): Promise<ExperimentApplyResult> {
  const capacity = CAPS.experiments - (await experimentsRepo.countByProject(projectId))
  const applicable = picks.slice(0, Math.max(0, capacity))
  let created = 0
  for (const pick of applicable) {
    await createExperiment(projectId, {
      hypothesis: pick.hypothesis,
      method: pick.method,
      successCriteria: pick.successCriteria,
      assumptionId,
    })
    created += 1
  }
  return { created, skipped: picks.length - created }
}
