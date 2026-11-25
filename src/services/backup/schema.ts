import { z } from 'zod'
import {
  assumptionSchema,
  decisionSchema,
  experimentSchema,
  ostNodeSchema,
  projectSchema,
  reportSchema,
  settingsRowSchema,
} from '@/schemas/entities'

/**
 * §7 .dcopilot 文件形状（§7.2 逐条对应；ost_nodes ↔ ostNodes 是唯一已记录的
 * 命名差异）。NEVER exported: ai_requests, ai_providers, score_events (§7.2
 * 没有对应键——审计轨不迁移)、onboarding 设置行与会话 Key。
 */

export const DCOPILT_FORMAT = 'discovery-copilot'
export const DCOPILT_FORMAT_VERSION = 2
export const DCOPILT_MAX_BYTES = 20 * 1024 * 1024

export const dcopilotFileSchema = z.object({
  format: z.literal(DCOPILT_FORMAT),
  formatVersion: z.number().int().min(0),
  appVersion: z.string(),
  exportedAt: z.string(),
  projects: z.array(projectSchema),
  assumptions: z.array(assumptionSchema),
  experiments: z.array(experimentSchema),
  ostNodes: z.array(ostNodeSchema),
  reports: z.array(reportSchema),
  decisions: z.array(decisionSchema),
  settings: settingsRowSchema.omit({ key: true }).nullable(),
})

export type DcopilotFile = z.infer<typeof dcopilotFileSchema>

/** Deterministic JSON (sorted keys) — the content digest behind §7.4 conflict rules. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}
