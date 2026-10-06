import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { requestPersistent, storageEstimate, type QuotaReport } from '@/db/quota'
import { snapshotsRepo } from '@/db/repositories'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageSkeleton } from '@/components/common/states'
import { downloadFile } from '@/lib/download'
import { formatWhen } from '@/lib/report-export'
import { useT } from '@/lib/i18n'
import {
  DCOPILT_MAX_BYTES,
  applyImport,
  buildDcopilotFile,
  createSnapshot,
  dcopilotFileName,
  parseDcopilotFile,
  summarizeImport,
  type ConflictStrategy,
  type DcopilotFile,
  type ImportItemStatus,
  type ImportSummary,
} from '@/services/backup'
import { clearProductData } from '@/services/maintenance'
import { listActiveProjects, listDeletedProjects } from '@/services/projects'

function formatBytes(bytes: number | null): string {
  return bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '—'
}

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

interface PendingImport {
  file: DcopilotFile
  summary: ImportSummary
}

export default function DataBackup() {
  const t = useT()
  const [quota, setQuota] = useState<QuotaReport | null>(null)
  const [persist, setPersist] = useState<'idle' | 'granted' | 'denied'>('idle')
  const [clearing, setClearing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [exportingAll, setExportingAll] = useState(false)
  const [exportingOne, setExportingOne] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [parseIssues, setParseIssues] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [strategy, setStrategy] = useState<ConflictStrategy>('copy')
  const [restoreSettings, setRestoreSettings] = useState(true)
  const [importing, setImporting] = useState(false)

  const projectRows = useLiveQuery(async () => {
    const [active, deleted] = await Promise.all([listActiveProjects(), listDeletedProjects()])
    return [...active, ...deleted]
  }, [])
  const snapshots = useLiveQuery(() => snapshotsRepo.list(), [])

  useEffect(() => {
    let alive = true
    storageEstimate()
      .then((q) => {
        if (alive) setQuota(q)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (projectRows === undefined || snapshots === undefined) return <PageSkeleton />

  async function handlePersist() {
    setPersist((await requestPersistent()) ? 'granted' : 'denied')
  }

  async function handleClearData() {
    if (!window.confirm(t('settings.dataBackup.clearConfirm1'))) return
    if (!window.confirm(t('settings.dataBackup.clearConfirm2'))) return
    setClearing(true)
    setError(null)
    try {
      await clearProductData()
      setNotice(t('settings.dataBackup.clearDone'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setClearing(false)
    }
  }

  async function handleExportAll() {
    setExportingAll(true)
    setError(null)
    setNotice(null)
    try {
      const file = await buildDcopilotFile('all')
      downloadFile(dcopilotFileName(t('dashboard.title')), JSON.stringify(file, null, 2), 'application/json')
      setNotice(t('settings.dataBackup.exportAllDone', { count: file.projects.length }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExportingAll(false)
    }
  }

  async function handleExportOne() {
    if (!selectedProjectId) return
    setExportingOne(true)
    setError(null)
    setNotice(null)
    try {
      const file = await buildDcopilotFile(selectedProjectId)
      const name = file.projects[0]?.name ?? ''
      downloadFile(dcopilotFileName(name), JSON.stringify(file, null, 2), 'application/json')
      setNotice(t('settings.dataBackup.exportOneDone', { name }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExportingOne(false)
    }
  }

  async function handleCreateSnapshot() {
    setSnapshotting(true)
    setError(null)
    setNotice(null)
    try {
      const snapshot = await createSnapshot()
      setNotice(t('settings.dataBackup.snapshotDone', { count: snapshot.projectCount }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSnapshotting(false)
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!window.confirm(t('settings.dataBackup.snapshotDeleteConfirm'))) return
    setError(null)
    try {
      await snapshotsRepo.delete(id)
      setNotice(t('settings.dataBackup.snapshotDeleted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** Shared entry for file import and snapshot restore — same pipeline (§7.3). */
  async function openImport(text: string) {
    setError(null)
    setNotice(null)
    const parsed = parseDcopilotFile(text)
    if (!parsed.ok) {
      setParseIssues(parsed.issues)
      return
    }
    setParseIssues(null)
    try {
      const summary = await summarizeImport(parsed.file)
      setPending({ file: parsed.file, summary })
      setStrategy('copy')
      setRestoreSettings(summary.hasSettings)
    } catch (err) {
      setParseIssues([err instanceof Error ? err.message : String(err)])
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > DCOPILT_MAX_BYTES) {
      setParseIssues([t('settings.dataBackup.importTooLarge')])
      return
    }
    openImport(await file.text())
  }

  async function handleConfirmImport() {
    if (!pending) return
    setImporting(true)
    setError(null)
    try {
      const result = await applyImport(pending.file, { conflictStrategy: strategy, restoreSettings })
      setPending(null)
      setNotice(
        t('settings.dataBackup.importDone', {
          created: result.created,
          overwritten: result.overwritten,
          skipped: result.skipped,
          duplicates: result.duplicates,
        }) +
          (result.settingsRestored ? t('settings.dataBackup.importDoneSettings') : '') +
          (result.snapshotId ? t('settings.dataBackup.importDoneSnapshot') : '') +
          '.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-headline text-ink">{t('settings.dataBackup.title')}</h2>

      <section aria-label={t('settings.dataBackup.quotaHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.quotaHeading')}</h3>
        <p className="mt-2 text-body text-ink">
          {t('settings.dataBackup.quotaUsage', {
            used: quota?.usage != null ? formatBytes(quota.usage) : t('settings.dataBackup.unknown'),
            quota: quota?.quota != null ? formatBytes(quota.quota) : t('settings.dataBackup.unknown'),
          })}
        </p>
        <p className="mt-1 text-caption text-ink-faint">{t('settings.dataBackup.quotaNote')}</p>
        {quota?.low && (
          <p role="status" className="mt-2 text-body-sm text-warning">
            {t('settings.dataBackup.quotaLow')}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void handlePersist()}>
            {t('settings.dataBackup.requestPersistent')}
          </Button>
          {persist === 'granted' && <span className="text-body-sm text-success">{t('settings.dataBackup.persistGranted')}</span>}
          {persist === 'denied' && (
            <span className="text-body-sm text-ink-muted">{t('settings.dataBackup.persistDenied')}</span>
          )}
        </div>
      </section>

      <section aria-label={t('settings.dataBackup.backupHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.backupHeading')}</h3>
        <p className="mt-2 text-caption text-ink-faint">{t('settings.dataBackup.backupNote')}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleExportAll()} disabled={exportingAll}>
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
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="mt-1 min-h-11 w-64 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink focus:border-accent-focus focus:outline-none"
            >
              <option value="">{t('settings.dataBackup.selectPlaceholder')}</option>
              {projectRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.deletedAt ? t('settings.dataBackup.trashSuffix') : ''}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => void handleExportOne()}
            disabled={!selectedProjectId || exportingOne}
          >
            {exportingOne ? t('settings.dataBackup.exportingOne') : t('settings.dataBackup.exportSelected')}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3">
            {t('settings.dataBackup.importLabel')}
            <input type="file" accept=".dcopilot,.json" onChange={handleImportFile} className="sr-only" />
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

      <section aria-label={t('settings.dataBackup.snapshotHeading')} className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">{t('settings.dataBackup.snapshotHeading')}</h3>
        <p className="mt-2 text-caption text-ink-faint">{t('settings.dataBackup.snapshotNote')}</p>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void handleCreateSnapshot()} disabled={snapshotting}>
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
                  <Button variant="ghost" onClick={() => void openImport(s.payload)}>
                    {t('settings.dataBackup.snapshotRestore')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => downloadFile(dcopilotFileName(t('dashboard.title')), s.payload, 'application/json')}
                  >
                    {t('settings.dataBackup.snapshotDownload')}
                  </Button>
                  <Button variant="ghost" onClick={() => void handleDeleteSnapshot(s.id)}>
                    {t('common.delete')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('settings.dataBackup.dangerHeading')} className="rounded-lg border border-danger/40 bg-surface-1 p-4">
        <h3 className="text-eyebrow text-danger">{t('settings.dataBackup.dangerHeading')}</h3>
        <p className="mt-2 text-body-sm text-ink-secondary">{t('settings.dataBackup.dangerDesc')}</p>
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
        <Button className="mt-3" variant="danger" onClick={() => void handleClearData()} disabled={clearing}>
          {clearing ? t('settings.dataBackup.clearing') : t('settings.dataBackup.clearData')}
        </Button>
      </section>

      <Dialog
        open={pending !== null}
        title={t('settings.dataBackup.importConfirmTitle')}
        onClose={() => {
          if (!importing) setPending(null)
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
                      onChange={() => setStrategy(opt.value)}
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
                onChange={(e) => setRestoreSettings(e.target.checked)}
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
              <Button onClick={() => void handleConfirmImport()} disabled={importing}>
                {importing ? t('settings.dataBackup.importing') : t('settings.dataBackup.confirmImport')}
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={importing}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
