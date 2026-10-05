import { z } from 'zod'

/**
 * Single source of truth for all persisted shapes (plan §9.2: TS 类型与 Zod Schema 同步维护 —
 * types are derived, never declared beside). Field names align with the §7.2 .dcopilot
 * file keys; the DB table `ost_nodes` maps to file key `ostNodes` at export time (command 10).
 */

/** The 8 risk categories (plan §5.1 / pm-skills identify-assumptions-new). */
export const ASSUMPTION_TYPES = [
  'value',
  'usability',
  'feasibility',
  'viability',
  'go-to-market',
  'strategy',
  'team',
  'legal',
] as const

export const projectSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  status: z.enum(['active', 'archived']).default('active'),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Recycle bin (§7.6): null = not deleted. */
  deletedAt: z.string().nullable().default(null),
})

export const assumptionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(ASSUMPTION_TYPES),
  statement: z.string().min(1).max(2000),
  impact: z.number().int().min(1).max(5),
  risk: z.number().int().min(1).max(5),
  /** null = 证据未评估 (§5.2); counts as 0 in the score. */
  confidence: z.number().min(0).max(1).nullable().default(null),
  /** Derived on write via computePriorityScore; default(0) only normalizes legacy rows on read. */
  priorityScore: z.number().default(0),
  status: z.enum(['open', 'testing', 'validated', 'invalidated', 'archived']).default('open'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const scoreSnapshotSchema = z.object({
  impact: z.number(),
  risk: z.number(),
  confidence: z.number().nullable(),
  priorityScore: z.number(),
})

export const scoreEventSchema = z.object({
  /** Auto-increment primary key assigned by Dexie on add; absent before insert. */
  seq: z.number().int().optional(),
  assumptionId: z.string(),
  projectId: z.string(),
  changedBy: z.enum(['user', 'ai-suggestion']),
  changedAt: z.string(),
  /** null = creation event (§5.2 audit). */
  before: scoreSnapshotSchema.nullable(),
  after: scoreSnapshotSchema,
})

export const experimentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  assumptionId: z.string().nullable().default(null),
  hypothesis: z.string().min(1).max(2000),
  method: z.string().min(1).max(1000),
  successCriteria: z.string().max(2000).nullable().default(null),
  status: z.enum(['planned', 'running', 'completed', 'dropped']).default('planned'),
  result: z.string().max(5000).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const OST_NODE_TYPES = ['outcome', 'opportunity', 'solution', 'experiment'] as const

export const ostNodeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(OST_NODE_TYPES),
  /** Only `outcome` may be a root (§5.3 chain: outcome ← opportunity ← solution ← experiment). */
  parentId: z.string().nullable().default(null),
  title: z.string().min(1).max(200),
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  linkedAssumptionId: z.string().nullable().default(null),
  linkedExperimentId: z.string().nullable().default(null),
  createdAt: z.string(),
})

export const reportSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1).max(200),
  content: z.string().max(500_000).default(''),
  generatedAt: z.string().nullable().default(null),
  generatedSections: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * Non-sensitive settings ONLY (§5.1: 严格排除 Secret). strictObject makes
 * secret-shaped fields structurally impossible; the settings service also
 * rejects secret-looking keys explicitly for a readable error.
 */
export const settingsSchema = z.strictObject({
  theme: z.enum(['dark', 'light', 'system']).default('dark'),
  defaultProviderId: z.string().nullable().default(null),
  /**
   * AI 执行模式（Prompt Relay 需求）：byok = 配置 Key 全自动；relay = 生成
   * Prompt 交给用户外部 agent、粘贴结果回应用（零配置默认）；hybrid = 有
   * Provider 走 byok、否则回落 relay。
   */
  aiMode: z.enum(['byok', 'relay', 'hybrid']).default('relay'),
  /** §6.4 预算熔断（USD）。null = 不设限；确认后可单次绕过（budgetConfirmed）。 */
  perRequestBudgetUsd: z.number().positive().nullable().default(null),
  monthlyBudgetUsd: z.number().positive().nullable().default(null),
  updatedAt: z.string(),
})

/** §6.4 用量记录：每次 AI 请求的元数据；仅存本地，不随 .dcopilot 导出。 */
export const aiRequestSchema = z.object({
  id: z.number().int().optional(),
  providerId: z.string(),
  projectId: z.string().nullable().default(null),
  model: z.string(),
  kind: z.enum(['text', 'json']),
  promptId: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nullable().default(null),
  status: z.enum(['ok', 'error']),
  errorCode: z.string().nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.string(),
})

export type AiRequest = z.infer<typeof aiRequestSchema>

/**
 * §7.6 pre-import snapshot: a full .dcopilot payload kept locally (latest 3)
 * as the second line of defense behind transaction rollback. Snapshot rows
 * never export with .dcopilot files and never surface as project data.
 */
export const snapshotSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  /** Stringified .dcopilot file — restore/download use it verbatim. */
  payload: z.string(),
  projectCount: z.number().int().nonnegative(),
  appVersion: z.string(),
})

export type Snapshot = z.infer<typeof snapshotSchema>

/**
 * §6.1 Provider configuration — non-secret by construction (strictObject).
 * Structurally identical to the runtime contract `ProviderConfig` in
 * src/ai/types.ts; this schema is the single source of truth for the
 * persisted `ai_providers` rows. Keys never live here (§6.3: session only).
 */
export const providerConfigSchema = z.strictObject({
  id: z.string(),
  label: z.string().min(1).max(60),
  kind: z.enum(['openai-compatible', 'gemini']),
  baseUrl: z.url(),
  model: z.string().min(1).max(120),
  createdAt: z.string(),
})

export type ProviderConfigRow = z.infer<typeof providerConfigSchema>

export const settingsRowSchema = settingsSchema.extend({ key: z.string() })

export type Project = z.infer<typeof projectSchema>
export type Assumption = z.infer<typeof assumptionSchema>
export type ScoreEvent = z.infer<typeof scoreEventSchema>
export type Experiment = z.infer<typeof experimentSchema>
export type OstNode = z.infer<typeof ostNodeSchema>
export type Report = z.infer<typeof reportSchema>
export type Settings = z.infer<typeof settingsSchema>
export type SettingsRow = z.infer<typeof settingsRowSchema>
