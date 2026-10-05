import type { Assumption } from '@/schemas/entities'

export type AssumptionType = Assumption['type']
export type AssumptionStatus = Assumption['status']

/**
 * Display metadata for the 8 risk categories (§5.1). The 6 pastel tints are
 * light backgrounds — badge text uses the dark surface color. Two tints are
 * reused for the 8 categories; the visible label keeps them distinguishable.
 */
export const ASSUMPTION_TYPE_META: Record<AssumptionType, { label: string; badgeClass: string }> = {
  value: { label: '价值', badgeClass: 'bg-tint-blue text-surface-1' },
  usability: { label: '可用性', badgeClass: 'bg-tint-green text-surface-1' },
  feasibility: { label: '可行性', badgeClass: 'bg-tint-purple text-surface-1' },
  viability: { label: '可存续性', badgeClass: 'bg-tint-yellow text-surface-1' },
  'go-to-market': { label: '市场进入', badgeClass: 'bg-tint-orange text-surface-1' },
  strategy: { label: '战略', badgeClass: 'bg-tint-pink text-surface-1' },
  team: { label: '团队', badgeClass: 'bg-tint-blue text-surface-1' },
  legal: { label: '法律合规', badgeClass: 'bg-tint-yellow text-surface-1' },
}

export const STATUS_META: Record<AssumptionStatus, { label: string; badgeClass: string }> = {
  open: { label: '待验证', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  testing: { label: '验证中', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  validated: { label: '已验证', badgeClass: 'bg-success/15 text-success border border-success/30' },
  invalidated: { label: '已证伪', badgeClass: 'bg-danger/15 text-danger border border-danger/30' },
  archived: { label: '已归档', badgeClass: 'bg-surface-3 text-ink-faint border border-hairline' },
}

export type Quadrant = 'experiment' | 'implement' | 'reject' | 'defer'

/**
 * Prioritize-assumptions quadrant split: ≥4 counts as high on the 1–5 scale.
 * experiment = high impact × high risk → test now; implement = high impact ×
 * low risk; reject = low impact × high risk; defer = the rest.
 */
export function quadrantOf(impact: number, risk: number): Quadrant {
  const highImpact = impact >= 4
  const highRisk = risk >= 4
  if (highImpact && highRisk) return 'experiment'
  if (highImpact) return 'implement'
  if (highRisk) return 'reject'
  return 'defer'
}

export const QUADRANT_META: Record<Quadrant, { label: string; hint: string }> = {
  experiment: { label: '优先实验', hint: '高影响 × 高风险：立即设计实验验证' },
  implement: { label: '推进实施', hint: '高影响 × 低风险：低风险高回报' },
  reject: { label: '考虑放弃', hint: '低影响 × 高风险：不值得投入验证' },
  defer: { label: '延后处理', hint: '低影响 × 低风险：先搁置' },
}
