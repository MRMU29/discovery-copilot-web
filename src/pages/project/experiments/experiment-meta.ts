import type { Experiment } from '@/schemas/entities'

export type ExperimentStatus = Experiment['status']
export type ExperimentOutcome = NonNullable<Experiment['outcome']>

/** Display metadata for the 4 experiment statuses (mirrors STATUS_META style). */
export const EXPERIMENT_STATUS_META: Record<ExperimentStatus, { labelKey: string; badgeClass: string }> = {
  planned: { labelKey: 'experiment.status.planned', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  running: { labelKey: 'experiment.status.running', badgeClass: 'bg-accent/15 text-ink border border-accent/30' },
  completed: { labelKey: 'experiment.status.completed', badgeClass: 'bg-success/15 text-success border border-success/30' },
  dropped: { labelKey: 'experiment.status.dropped', badgeClass: 'bg-surface-3 text-ink-faint border border-hairline' },
}

/** §roadmap 4.2: the three outcomes a completed experiment can report. */
export const OUTCOME_META: Record<ExperimentOutcome, { labelKey: string; badgeClass: string }> = {
  supported: { labelKey: 'experiments.outcome.supported', badgeClass: 'bg-success/15 text-success border border-success/30' },
  refuted: { labelKey: 'experiments.outcome.refuted', badgeClass: 'bg-danger/10 text-danger border border-danger/30' },
  inconclusive: { labelKey: 'experiments.outcome.inconclusive', badgeClass: 'bg-surface-3 text-ink-muted border border-hairline' },
}

const COLUMN_ORDER: ExperimentStatus[] = ['planned', 'running', 'completed', 'dropped']

/**
 * Board columns. Unknown statuses (legacy/corrupt rows) fall into `planned`
 * instead of disappearing — losing a row from the UI is worse than misfiling it.
 */
export function groupByStatus(experiments: Experiment[]): Record<ExperimentStatus, Experiment[]> {
  const groups: Record<ExperimentStatus, Experiment[]> = {
    planned: [],
    running: [],
    completed: [],
    dropped: [],
  }
  for (const experiment of experiments) {
    const bucket = groups[experiment.status] ?? groups.planned
    bucket.push(experiment)
  }
  return groups
}

/** "Completed but nobody wrote down what happened" — a nudge, not an error. */
export function pendingResultCount(experiments: Experiment[]): number {
  return experiments.filter(
    (e) => e.status === 'completed' && !e.result?.trim() && e.outcome === null,
  ).length
}

export const BOARD_COLUMNS = COLUMN_ORDER
