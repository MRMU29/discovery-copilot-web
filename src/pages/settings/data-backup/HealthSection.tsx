import { Button } from '@/components/ui/Button'
import { formatWhen } from '@/lib/report-export'
import { useT } from '@/lib/i18n'
import type { HealthIssue, HealthReport } from '@/services/health'
import { issueKey } from './issue-key'

const HEALTH_KIND_KEYS: Record<HealthIssue['kind'], string> = {
  orphan: 'health.kind.orphan',
  'broken-link': 'health.kind.brokenLink',
  cycle: 'health.kind.cycle',
  'over-capacity': 'health.kind.overCapacity',
}

export interface HealthSectionProps {
  report: HealthReport | null
  scanning: boolean
  /** 正在修复的 issue key（null = 空闲）。 */
  repairingKey: string | null
  notice: string | null
  error: string | null
  onScan: () => void
  onRepair: (issue: HealthIssue) => void
}

/** 数据自检：扫描孤儿行 / 断链 / OST 成环，并逐条修复。 */
export function HealthSection({
  report,
  scanning,
  repairingKey,
  notice,
  error,
  onScan,
  onRepair,
}: HealthSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.dataBackup.healthHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.healthHeading')}</h3>
      <p className="mt-2 text-caption text-ink-faint">{t('settings.dataBackup.healthDesc')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onScan} disabled={scanning}>
          {scanning ? t('settings.dataBackup.healthScanning') : t('settings.dataBackup.healthScan')}
        </Button>
        {report && (
          <span className="text-caption text-ink-faint">
            {t('settings.dataBackup.healthScannedAt', { when: formatWhen(report.scannedAt) })}
          </span>
        )}
      </div>

      {notice && (
        <p role="status" className="mt-2 text-body-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}

      {report && report.issues.length === 0 && (
        <p role="status" className="mt-3 text-body-sm text-success">
          {t('settings.dataBackup.healthClean', {
            rows: Object.values(report.counts).reduce((sum, value) => sum + value, 0),
          })}
        </p>
      )}

      {report && report.issues.length > 0 && (
        <>
          <p className="mt-3 text-caption text-ink-secondary">
            {t('settings.dataBackup.healthSummary', { count: report.issues.length })}
          </p>
          <ul className="mt-2 space-y-2">
            {report.issues.map((issue) => {
              const key = issueKey(issue)
              const label = issue.label.length > 80 ? `${issue.label.slice(0, 80)}…` : issue.label
              return (
                <li
                  key={key}
                  className="flex flex-col gap-2 rounded-btn border border-hairline bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0 flex-1 text-body-sm text-ink-secondary">
                    <span className="mr-2 rounded-full border border-hairline bg-surface-1 px-1.5 text-caption text-ink-muted">
                      {t(HEALTH_KIND_KEYS[issue.kind])}
                    </span>
                    {label || issue.entityId}
                    {issue.kind === 'over-capacity' && issue.detail && (
                      <span className="ml-2 text-caption text-danger">
                        {t('health.detail.overCapacity', {
                          count: issue.detail.count ?? 0,
                          limit: issue.detail.limit ?? 0,
                        })}
                      </span>
                    )}
                  </span>
                  {issue.kind !== 'over-capacity' && (
                    <Button variant="ghost" onClick={() => onRepair(issue)} disabled={repairingKey !== null}>
                      {repairingKey === key
                        ? t('settings.dataBackup.healthRepairing')
                        : t('settings.dataBackup.healthRepair')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
