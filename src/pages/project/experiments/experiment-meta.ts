import type { Experiment } from '@/schemas/entities'

export type ExperimentStatus = Experiment['status']

/** Display metadata for the 4 experiment statuses (mirrors STATUS_META style). */
export const EXPERIMENT_STATUS_META: Record<ExperimentStatus, { label: string; badgeClass: string }> = {
  planned: { label: '待执行', badgeClass: 'bg-surface-3 text-ink-secondary border border-hairline' },
  running: { label: '进行中', badgeClass: 'bg-accent/15 text-ink border border-accent/30' },
  completed: { label: '已完成', badgeClass: 'bg-success/15 text-success border border-success/30' },
  dropped: { label: '已放弃', badgeClass: 'bg-surface-3 text-ink-faint border border-hairline' },
}

/** Truncate a linked assumption statement for the badge line. */
export function truncateStatement(statement: string, max = 24): string {
  return statement.length > max ? `${statement.slice(0, max)}…` : statement
}
