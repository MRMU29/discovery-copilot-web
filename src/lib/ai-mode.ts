import { z } from 'zod'
import type { Settings } from '@/schemas/entities'

/**
 * AI 执行模式（Prompt Relay 需求）：应用自身不持 Key 也能完成 AI 任务。
 * byok = 配置 Key 全自动；relay = 生成 Prompt → 用户交给外部 agent → 粘贴
 * 结果回应用；hybrid = 重任务按「是否已配置 Provider」自动路由。
 */

export const AI_MODES = ['byok', 'relay', 'hybrid'] as const
export type AiMode = Settings['aiMode']
export type AiRoute = 'byok' | 'relay'

export const aiModeSchema = z.enum(AI_MODES)

export const AI_MODE_META: Record<AiMode, { label: string; description: string }> = {
  byok: {
    label: '内置 AI（BYOK）',
    description: '配置 API Key 后应用直接调用 AI，全自动。Key 仅保存在当前会话。',
  },
  relay: {
    label: 'Prompt Relay（推荐入门）',
    description: '零配置：应用生成结构化 Prompt，你复制给自己的 AI 助手（Claude / ChatGPT / 豆包…），再把结果粘贴回来。',
  },
  hybrid: {
    label: '混合',
    description: '已配置 Provider 时自动走 BYOK，未配置时回落 Prompt Relay。输入质量检测始终本地执行。',
  },
}

/** Hybrid routes to BYOK only when a provider is configured; relay otherwise. */
export function resolveAiRoute(mode: AiMode, hasProvider: boolean): AiRoute {
  if (mode === 'byok') return 'byok'
  if (mode === 'relay') return 'relay'
  return hasProvider ? 'byok' : 'relay'
}
