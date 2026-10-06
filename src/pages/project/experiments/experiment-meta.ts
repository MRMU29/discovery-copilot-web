import type { Experiment } from '@/schemas/entities'

export type ExperimentStatus = Experiment['status']

/** Display metadata for the 4 experiment statuses (mirrors STATUS_META style). */
export const EXPERIMENT_STATUS_META: Record<ExperimentStatus, { labelKey: string; badgeClass: string }> = {
  planned: { labelKey: 'experiment.status.planned', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  running: { labelKey: 'experiment.status.running', badgeClass: 'bg-accent/15 text-ink border border-accent/30' },
  completed: { labelKey: 'experiment.status.completed', badgeClass: 'bg-success/15 text-success border border-success/30' },
  dropped: { labelKey: 'experiment.status.dropped', badgeClass: 'bg-surface-3 text-ink-faint border border-hairline' },
}

/** Truncate a linked assumption statement for the badge line. */
export function truncateStatement(statement: string, max = 24): string {
  return statement.length > max ? `${statement.slice(0, max)}…` : statement
}
