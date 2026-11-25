/**
 * Prompt parameters (§v0.2.4): only three levers are exposed — tone, detail and
 * language. Free-form template editing stays out of the product.
 *
 * The fragments are written in Chinese because they are appended to the
 * (Chinese) instruction body; the *output* language is a separate placeholder
 * handled by builders. Version 1.2.0 of the task templates owns the
 * `{{tone}}` / `{{detail}}` slots, so a ledger row with an older version stays
 * reproducible.
 */

export const PROMPT_TONES = ['neutral', 'direct', 'warm'] as const
export type PromptTone = (typeof PROMPT_TONES)[number]

export const PROMPT_DETAILS = ['brief', 'standard', 'deep'] as const
export type PromptDetail = (typeof PROMPT_DETAILS)[number]

export interface PromptOptions {
  tone: PromptTone
  detail: PromptDetail
}

export const DEFAULT_PROMPT_OPTIONS: PromptOptions = {
  tone: 'neutral',
  detail: 'standard',
}

const TONE_FRAGMENTS: Record<PromptTone, string> = {
  neutral: '语气中性克制，只陈述事实与判断',
  direct: '语气直接，先给结论，少铺垫、少客套',
  warm: '语气温和，照顾读者的理解成本，但不牺牲准确',
}

const DETAIL_FRAGMENTS: Record<PromptDetail, string> = {
  brief: '详略：简略，只保留决策必需的信息，条目尽量短',
  standard: '详略：标准，信息完整、重点突出',
  deep: '详略：详尽，补充推导过程、边界条件与风险',
}

export function toneFragment(tone: PromptTone): string {
  return TONE_FRAGMENTS[tone]
}

export function detailFragment(detail: PromptDetail): string {
  return DETAIL_FRAGMENTS[detail]
}

/** Shape recorded in the usage ledger so a request can be reproduced later. */
export interface PromptOptionValues extends PromptOptions {
  language: string
}
