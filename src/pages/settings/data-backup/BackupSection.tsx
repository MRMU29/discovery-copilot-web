import { Button } from '@/components/ui/Button'
import { useT } from '@/lib/i18n'
import type { Project } from '@/schemas/entities'

export interface BackupSectionProps {
  projects: Project[]
  selectedProjectId: string
  onSelectProject: (id: string) => void
  exportingAll: boolean
  exportingOne: boolean
  onExportAll: () => void
  onExportOne: () => void
  onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** 解析失败的原因（null = 没有错误）。 */
  parseIssues: string[] | null
}

/** 导出（全部 / 单项目）与导入入口。 */
export function BackupSection({
  projects,
  selectedProjectId,
  onSelectProject,
  exportingAll,
  exportingOne,
  onExportAll,
  onExportOne,
  onImportFile,
  parseIssues,
}: BackupSectionProps) {
  const t = useT()
  return (
    <section aria-label={t('settings.dataBackup.backupHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
      <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.backupHeading')}</h3>
      <p className="mt-2 text-caption text-ink-faint">{t('settings.dataBackup.backupNote')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={onExportAll} disabled={exportingAll}>
          {exportingAll ? t('settings.dataBackup.exportingAll') : t('settings.dataBackup.exportAll')}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="backup-project-select" className="text-caption text-ink-muted">
            {t('settings.dataBackup.exportOneLabel')}
          </label>
          <select
            id="backup-project-select"
            value={selectedProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
            className="mt-1 min-h-11 w-64 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink focus:border-accent-focus focus:outline-none"
          >
            <option value="">{t('settings.dataBackup.selectPlaceholder')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.deletedAt ? t('settings.dataBackup.trashSuffix') : ''}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={onExportOne} disabled={!selectedProjectId || exportingOne}>
          {exportingOne ? t('settings.dataBackup.exportingOne') : t('settings.dataBackup.exportSelected')}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3">
          {t('settings.dataBackup.importLabel')}
          <input type="file" accept=".dcopilot,.json" onChange={onImportFile} className="sr-only" />
        </label>
      </div>

      {parseIssues && (
        <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
          <p className="text-body-sm font-medium text-danger">{t('settings.dataBackup.importRejected')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption text-ink-secondary">
            {parseIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
