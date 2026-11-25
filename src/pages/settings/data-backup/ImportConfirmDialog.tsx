import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useT } from '@/lib/i18n'
import type { ConflictStrategy, DcopilotFile, ImportItemStatus, ImportSummary } from '@/services/backup'

const STRATEGY_OPTIONS: { value: ConflictStrategy; labelKey: string; hintKey: string }[] = [
  { value: 'copy', labelKey: 'settings.dataBackup.strategyCopy', hintKey: 'settings.dataBackup.strategyCopyHint' },
  {
    value: 'overwrite',
    labelKey: 'settings.dataBackup.strategyOverwrite',
    hintKey: 'settings.dataBackup.strategyOverwriteHint',
  },
  { value: 'skip', labelKey: 'settings.dataBackup.strategySkip', hintKey: 'settings.dataBackup.strategySkipHint' },
]

const STATUS_LABEL_KEYS: Record<ImportItemStatus, string> = {
  new: 'settings.dataBackup.status.new',
  conflict: 'settings.dataBackup.status.conflict',
  duplicate: 'settings.dataBackup.status.duplicate',
}

const STATUS_BADGES: Record<ImportItemStatus, string> = {
  new: 'bg-success/15 text-success border border-success/30',
  conflict: 'bg-warning/10 text-warning border border-warning/40',
  duplicate: 'bg-surface-3 text-ink-muted border border-hairline',
}

export interface ImportConfirmDialogProps {
  /** null = 关闭。 */
  pending: { file: DcopilotFile; summary: ImportSummary } | null
  strategy: ConflictStrategy
  onStrategy: (next: ConflictStrategy) => void
  restoreSettings: boolean
  onRestoreSettings: (next: boolean) => void
  importing: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

/** §7.4 导入预览：逐项目状态 + 冲突策略 + 是否恢复设置。 */
export function ImportConfirmDialog({
  pending,
  strategy,
  onStrategy,
  restoreSettings,
  onRestoreSettings,
  importing,
  error,
  onConfirm,
  onClose,
}: ImportConfirmDialogProps) {
  const t = useT()
  return (
    <Dialog
      open={pending !== null}
      title={t('settings.dataBackup.importConfirmTitle')}
      onClose={() => {
        if (!importing) onClose()
      }}
    >
      {pending && (
        <div className="space-y-4">
          <div className="rounded-lg border border-hairline bg-surface-2 p-3 text-caption text-ink-secondary">
            <p className="font-medium text-ink">{t('settings.dataBackup.summaryTitle')}</p>
            <p className="mt-1">
              {t('settings.dataBackup.summaryProjects', {
                count: pending.file.projects.length,
                created: pending.summary.counts.new,
                conflict: pending.summary.counts.conflict,
                duplicate: pending.summary.counts.duplicate,
              })}
            </p>
            <p className="mt-0.5">
              {t('settings.dataBackup.summaryTotals', {
                assumptions: pending.summary.totals.assumptions,
                experiments: pending.summary.totals.experiments,
                ostNodes: pending.summary.totals.ostNodes,
                reports: pending.summary.totals.reports,
              })}
            </p>
            <p className="mt-0.5">
              {t('settings.dataBackup.summarySettings', {
                has: pending.summary.hasSettings
                  ? t('settings.dataBackup.settingsInFile')
                  : t('settings.dataBackup.settingsNotInFile'),
              })}
            </p>
          </div>

          <ul className="space-y-1.5 text-caption">
            {pending.summary.items.map((item) => (
              <li key={item.project.id} className="flex flex-wrap items-center gap-2">
                <span className="text-body-sm text-ink">{item.project.name}</span>
                {item.project.deletedAt && (
                  <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-ink-faint">
                    {t('settings.dataBackup.trashSuffix')}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 ${STATUS_BADGES[item.status]}`}>
                  {t(STATUS_LABEL_KEYS[item.status])}
                </span>
                {item.sameName && <span className="text-warning">{t('settings.dataBackup.sameNameWarning')}</span>}
              </li>
            ))}
          </ul>

          <fieldset>
            <legend className="text-caption text-ink-muted">{t('settings.dataBackup.strategyLegend')}</legend>
            <div className="mt-1 space-y-1">
              {STRATEGY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex min-h-9 items-start gap-2 text-body-sm text-ink">
                  <input
                    type="radio"
                    name="conflict-strategy"
                    value={opt.value}
                    checked={strategy === opt.value}
                    onChange={() => onStrategy(opt.value)}
                    className="mt-1 size-4 accent-accent"
                  />
                  <span>
                    <span className="font-medium">{t(opt.labelKey)}</span>
                    <span className="text-ink-muted"> — {t(opt.hintKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex min-h-9 items-center gap-2 text-body-sm text-ink">
            <input
              type="checkbox"
              checked={restoreSettings}
              disabled={!pending.summary.hasSettings}
              onChange={(e) => onRestoreSettings(e.target.checked)}
              className="size-4 accent-accent"
            />
            {t('settings.dataBackup.restoreSettings')}
          </label>

          {error && (
            <p role="alert" className="text-body-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={onConfirm} disabled={importing}>
              {importing ? t('settings.dataBackup.importing') : t('settings.dataBackup.confirmImport')}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={importing}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
