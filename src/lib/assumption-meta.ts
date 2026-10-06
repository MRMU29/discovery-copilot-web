import type { Assumption } from '@/schemas/entities'

export type AssumptionType = Assumption['type']
export type AssumptionStatus = Assumption['status']

/**
 * Display metadata for the 8 risk categories (§5.1). The 6 pastel tints are
 * light backgrounds — badge text uses the dark surface color. Two tints are
 * reused for the 8 categories; the visible label keeps them distinguishable.
 */
export const ASSUMPTION_TYPE_META: Record<AssumptionType, { labelKey: string; badgeClass: string }> = {
  value: { labelKey: 'assumption.type.value', badgeClass: 'bg-tint-blue text-surface-1' },
  usability: { labelKey: 'assumption.type.usability', badgeClass: 'bg-tint-green text-surface-1' },
  feasibility: { labelKey: 'assumption.type.feasibility', badgeClass: 'bg-tint-purple text-surface-1' },
  viability: { labelKey: 'assumption.type.viability', badgeClass: 'bg-tint-yellow text-surface-1' },
  'go-to-market': { labelKey: 'assumption.type.goToMarket', badgeClass: 'bg-tint-orange text-surface-1' },
  strategy: { labelKey: 'assumption.type.strategy', badgeClass: 'bg-tint-pink text-surface-1' },
  team: { labelKey: 'assumption.type.team', badgeClass: 'bg-tint-blue text-surface-1' },
  legal: { labelKey: 'assumption.type.legal', badgeClass: 'bg-tint-yellow text-surface-1' },
}

export const STATUS_META: Record<AssumptionStatus, { labelKey: string; badgeClass: string }> = {
  open: { labelKey: 'assumption.status.open', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  testing: { labelKey: 'assumption.status.testing', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  validated: { labelKey: 'assumption.status.validated', badgeClass: 'bg-success/15 text-success border border-success/30' },
  invalidated: { labelKey: 'assumption.status.invalidated', badgeClass: 'bg-danger/15 text-danger border border-danger/30' },
  archived: { labelKey: 'assumption.status.archived', badgeClass: 'bg-surface-3 text-ink-faint border border-hairline' },
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

export const QUADRANT_META: Record<Quadrant, { labelKey: string; hintKey: string }> = {
  experiment: { labelKey: 'quadrant.experiment', hintKey: 'quadrant.experimentHint' },
  implement: { labelKey: 'quadrant.implement', hintKey: 'quadrant.implementHint' },
  reject: { labelKey: 'quadrant.reject', hintKey: 'quadrant.rejectHint' },
  defer: { labelKey: 'quadrant.defer', hintKey: 'quadrant.deferHint' },
}
