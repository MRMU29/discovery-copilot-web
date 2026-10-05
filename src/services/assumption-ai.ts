import { z } from 'zod'
import { buildIdentifyPrompt } from '@/ai/prompts/builders'
import { resolvePricing } from '@/ai/pricing'
import { runAi } from '@/ai/run'
import type { AIProvider, GenerateJSONResult } from '@/ai/types'
import { assumptionsRepo } from '@/db/repositories'
import { CAPS } from '@/lib/limits'
import { ASSUMPTION_TYPES } from '@/schemas/entities'
import { createAssumption } from './assumptions'

/**
 * AI-side of §5.2「AI 仅可提出建议」: the model proposes statements plus
 * impact/risk suggestions, never confidence — evidence is the user's call.
 * Everything lands in the review dialog before any row is written.
 */

const identifiedAssumptionSchema = z.object({
  statement: z.string().min(5).max(500),
  type: z.enum(ASSUMPTION_TYPES),
  rationale: z.string().min(1).max(300),
  suggestedImpact: z.number().int().min(1).max(5),
  suggestedRisk: z.number().int().min(1).max(5),
})

/** Wider floor than the prompt asks for — the model decides count, we bound it. */
export const identifyResultSchema = z.object({
  assumptions: z.array(identifiedAssumptionSchema).min(3).max(12),
})

export type IdentifiedAssumption = z.infer<typeof identifiedAssumptionSchema>

export interface IdentifyOptions {
  projectId?: string
  projectName?: string
  /** User-provided background: product idea, audience, constraints (max ~8k chars). */
  context: string
  signal?: AbortSignal
  /** §6.4 熔断确认后的单次绕过（UI「本次继续」）。 */
  budgetConfirmed?: boolean
}

export async function identifyAssumptions(
  provider: AIProvider,
  options: IdentifyOptions,
): Promise<GenerateJSONResult<IdentifiedAssumption[]>> {
  const context = options.context.trim()
  if (context.length < 10) {
    throw new Error('请先填写至少 10 个字的项目背景或想法描述。')
  }

  // Prompt Relay「模板三共享」：BYOK system=instruction、user=inputBlock，
  // Relay 路径由 UI 用同一 bundle 的 relayText 走复制-粘贴。
  const bundle = buildIdentifyPrompt({ projectName: options.projectName, context })

  const result = await runAi(provider, {
    kind: 'json',
    schema: identifyResultSchema,
    systemPrompt: bundle.instruction,
    promptId: 'identify-assumptions',
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
  return { data: result.data.assumptions, usage: result.usage, attempts: result.attempts }
}

export interface ApplyResult {
  created: number
  skipped: number
}

/**
 * Persists user-reviewed suggestions as assumptions (changedBy 'ai-suggestion'
 * so the audit trail shows where the initial scores came from). Silently caps
 * at the project's remaining capacity instead of half-failing mid-batch.
 */
export async function applyIdentifiedAssumptions(
  projectId: string,
  picks: IdentifiedAssumption[],
): Promise<ApplyResult> {
  const capacity = CAPS.assumptions - (await assumptionsRepo.countByProject(projectId))
  const applicable = picks.slice(0, Math.max(0, capacity))
  let created = 0
  for (const pick of applicable) {
    await createAssumption(
      projectId,
      {
        statement: pick.statement,
        type: pick.type,
        impact: pick.suggestedImpact,
        risk: pick.suggestedRisk,
        confidence: null,
      },
      { changedBy: 'ai-suggestion' },
    )
    created += 1
  }
  return { created, skipped: picks.length - created }
}
