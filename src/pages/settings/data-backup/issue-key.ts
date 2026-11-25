import type { HealthIssue } from '@/services/health'

/** Stable list key: one row can carry several broken links (different fields). */
export function issueKey(issue: HealthIssue): string {
  return `${issue.kind}|${issue.table}|${issue.entityId}|${issue.detail?.field ?? ''}|${issue.detail?.refId ?? ''}`
}
