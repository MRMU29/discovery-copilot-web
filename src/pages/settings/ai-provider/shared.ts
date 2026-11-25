import type { ProviderConfigRow } from '@/schemas/entities'

export type ProviderKind = ProviderConfigRow['kind']

export const KIND_LABEL_KEYS: Record<ProviderKind, string> = {
  'openai-compatible': 'settings.aiProvider.kindOpenai',
  gemini: 'settings.aiProvider.kindGemini',
}

export const cardClass = 'rounded-lg border border-hairline bg-surface-1 p-4'

export const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

export const PROMPT_LABEL_KEYS: Record<string, string> = {
  'identify-assumptions': 'settings.aiProvider.prompt.identifyAssumptions',
  'design-experiments': 'settings.aiProvider.prompt.designExperiments',
  'generate-report': 'settings.aiProvider.prompt.generateReport',
  chat: 'settings.aiProvider.prompt.chat',
  'chat-json': 'settings.aiProvider.prompt.chatJson',
}

export function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`
}
