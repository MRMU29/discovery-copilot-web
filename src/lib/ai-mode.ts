import type { Settings } from '@/schemas/entities'

/**
 * AI 执行模式（Prompt Relay 需求）：应用自身不持 Key 也能完成 AI 任务。
 * byok = 配置 Key 全自动；relay = 生成 Prompt → 用户交给外部 agent → 粘贴
 * 结果回应用；hybrid = 重任务按「是否已配置 Provider」自动路由。
 */

export const AI_MODES = ['byok', 'relay', 'hybrid'] as const
export type AiMode = Settings['aiMode']
export type AiRoute = 'byok' | 'relay'

/** Hybrid routes to BYOK only when a provider is configured; relay otherwise. */
export function resolveAiRoute(mode: AiMode, hasProvider: boolean): AiRoute {
  if (mode === 'byok') return 'byok'
  if (mode === 'relay') return 'relay'
  return hasProvider ? 'byok' : 'relay'
}
