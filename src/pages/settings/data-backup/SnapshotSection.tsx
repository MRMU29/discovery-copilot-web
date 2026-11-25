import { SNAPSHOT_BUDGET_BYTES, SNAPSHOT_KEEP } from '@/db/repositories'
import { Button } from '@/components/ui/Button'
import { formatWhen } from '@/lib/report-export'
import { useT } from '@/lib/i18n'
import type { Snapshot } from '@/schemas/entities'

export interface SnapshotSectionProps {
  snapshots: Snapshot[]
  /** UTF-8 字节数总量（与导入上限、保留预算同单位）。 */
  snapshotBytes: number
  snapshotting: boolean
  onCreate: () => void
  onRestore: (payload: string) => void
  onDownload: (payload: string) => void
  onDelete: (id: string) => void
}

/** §7.6 本地快照：列表 + 建/还原/下载/删除。 */
export function SnapshotSection({
  snapshots,
  snapshotBytes,
  snapshotting,
  onCreate,
  onRestore,
  onDownload,
  onDelete,
}: SnapshotSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.dataBackup.snapshotHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.snapshotHeading')}</h3>
      <p className="mt-2 text-caption text-ink-faint">{t('settings.dataBackup.snapshotNote')}</p>
      <p className="mt-1 text-caption text-ink-faint">
        {t('settings.dataBackup.snapshotBudget', {
          size: (snapshotBytes / 1024 / 1024).toFixed(1),
          budget: Math.round(SNAPSHOT_BUDGET_BYTES / 1024 / 1024),
          keep: SNAPSHOT_KEEP,
        })}
      </p>
      <div className="mt-3">
        <Button variant="secondary" onClick={onCreate} disabled={snapshotting}>
          {snapshotting ? t('settings.dataBackup.creatingSnapshot') : t('settings.dataBackup.createSnapshot')}
        </Button>
      </div>
      {snapshots.length === 0 ? (
        <p className="mt-3 text-caption text-ink-faint">{t('settings.dataBackup.noSnapshots')}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-hairline bg-surface-2 px-3 py-2"
            >
              <span className="text-caption text-ink">
                {formatWhen(s.createdAt)} · {s.projectCount} · {Math.max(1, Math.round(s.payload.length / 1024))} KB
              </span>
              <span className="flex gap-2">
                <Button variant="ghost" onClick={() => onRestore(s.payload)}>
                  {t('settings.dataBackup.snapshotRestore')}
                </Button>
                <Button variant="ghost" onClick={() => onDownload(s.payload)}>
                  {t('settings.dataBackup.snapshotDownload')}
                </Button>
                <Button variant="ghost" onClick={() => onDelete(s.id)}>
                  {t('common.delete')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
