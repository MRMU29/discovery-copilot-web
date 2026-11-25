import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { requestPersistent, storageEstimate, type QuotaReport } from '@/db/quota'
import { SNAPSHOT_KEEP, snapshotsRepo } from '@/db/repositories'
import { PageSkeleton } from '@/components/common/states'
import { downloadFile } from '@/lib/download'
import { confirmAction } from '@/lib/confirm'
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
  type ImportSummary,
} from '@/services/backup'
import { clearProductData } from '@/services/maintenance'
import { scanDataHealth, repairHealthIssue, type HealthIssue, type HealthReport } from '@/services/health'
import { updateSettings } from '@/services/settings'
import { nowIso } from '@/lib/clock'
import { listActiveProjects, listDeletedProjects } from '@/services/projects'
import { QuotaSection } from './data-backup/QuotaSection'
import { BackupSection } from './data-backup/BackupSection'
import { SnapshotSection } from './data-backup/SnapshotSection'
import { HealthSection } from './data-backup/HealthSection'
import { issueKey } from './data-backup/issue-key'
import { DangerSection } from './data-backup/DangerSection'
import { ImportConfirmDialog } from './data-backup/ImportConfirmDialog'

interface PendingImport {
  file: DcopilotFile
  summary: ImportSummary
}

/**
 * 设置 · 数据与备份。本身只做「状态 + 副作用」，各分区是纯展示组件
 * （见 ./data-backup/*），这样单个文件不再堆到 600 行。
 */
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
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [scanning, setScanning] = useState(false)
  const [repairingKey, setRepairingKey] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [healthNotice, setHealthNotice] = useState<string | null>(null)

  const projectRows = useLiveQuery(async () => {
    const [active, deleted] = await Promise.all([listActiveProjects(), listDeletedProjects()])
    return [...active, ...deleted]
  }, [])
  const snapshots = useLiveQuery(() => snapshotsRepo.list(), [])
  const snapshotBytes = (snapshots ?? []).reduce(
    // UTF-8 bytes, same unit as the import ceiling and the retention budget.
    (total, row) => total + new TextEncoder().encode(row.payload).byteLength,
    0,
  )

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

  async function handleScanHealth() {
    setScanning(true)
    setHealthError(null)
    setHealthNotice(null)
    try {
      setHealthReport(await scanDataHealth())
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  async function handleRepair(issue: HealthIssue) {
    if (!(await confirmAction({ title: t('confirm.confirmTitle'), body: t('settings.dataBackup.healthRepairConfirm') }))) return
    const key = issueKey(issue)
    setRepairingKey(key)
    setHealthError(null)
    setHealthNotice(null)
    try {
      await repairHealthIssue(issue)
      // Re-scan so the list reflects reality instead of a locally patched copy.
      setHealthReport(await scanDataHealth())
      setHealthNotice(t('settings.dataBackup.healthRepaired'))
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepairingKey(null)
    }
  }

  async function handleClearData() {
    if (!(await confirmAction({ title: t('confirm.clearTitle'), body: t('settings.dataBackup.clearConfirm1'), tone: 'danger' }))) return
    if (!(await confirmAction({ title: t('confirm.clearTitle'), body: t('settings.dataBackup.clearConfirm2'), tone: 'danger' }))) return
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
      // Backup health (§7.3 gap): record that a full export just happened.
      await updateSettings({ lastBackupAt: nowIso() }).catch(() => undefined)
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
      await updateSettings({ lastBackupAt: nowIso() }).catch(() => undefined)
      setNotice(t('settings.dataBackup.exportOneDone', { name }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExportingOne(false)
    }
  }

  async function handleCreateSnapshot() {
    // The 4th snapshot silently dropped the oldest one (count *and* byte budget).
    // Warn first so the user can download it — a snapshot is a full backup.
    if ((snapshots?.length ?? 0) >= SNAPSHOT_KEEP) {
      const confirmed = await confirmAction({
        title: t('confirm.confirmTitle'),
        body: t('settings.dataBackup.snapshotPruneConfirm', { keep: SNAPSHOT_KEEP }),
      })
      if (!confirmed) return
    }
    setSnapshotting(true)
    setError(null)
    setNotice(null)
    try {
      const { snapshot, pruned } = await createSnapshot()
      setNotice(
        pruned.length > 0
          ? t('settings.dataBackup.snapshotDonePruned', {
              count: snapshot.projectCount,
              pruned: pruned.length,
            })
          : t('settings.dataBackup.snapshotDone', { count: snapshot.projectCount }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSnapshotting(false)
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!(await confirmAction({ title: t('confirm.deleteTitle'), body: t('settings.dataBackup.snapshotDeleteConfirm'), tone: 'danger' }))) return
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

      <QuotaSection quota={quota} persist={persist} onRequestPersist={() => void handlePersist()} />

      <BackupSection
        projects={projectRows}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        exportingAll={exportingAll}
        exportingOne={exportingOne}
        onExportAll={() => void handleExportAll()}
        onExportOne={() => void handleExportOne()}
        onImportFile={handleImportFile}
        parseIssues={parseIssues}
      />

      <SnapshotSection
        snapshots={snapshots}
        snapshotBytes={snapshotBytes}
        snapshotting={snapshotting}
        onCreate={() => void handleCreateSnapshot()}
        onRestore={(payload) => void openImport(payload)}
        onDownload={(payload) =>
          downloadFile(dcopilotFileName(t('dashboard.title')), payload, 'application/json')
        }
        onDelete={(id) => void handleDeleteSnapshot(id)}
      />

      <HealthSection
        report={healthReport}
        scanning={scanning}
        repairingKey={repairingKey}
        notice={healthNotice}
        error={healthError}
        onScan={() => void handleScanHealth()}
        onRepair={(issue) => void handleRepair(issue)}
      />

      <DangerSection
        notice={notice}
        error={error}
        clearing={clearing}
        onClear={() => void handleClearData()}
      />

      <ImportConfirmDialog
        pending={pending}
        strategy={strategy}
        onStrategy={setStrategy}
        restoreSettings={restoreSettings}
        onRestoreSettings={setRestoreSettings}
        importing={importing}
        error={error}
        onConfirm={() => void handleConfirmImport()}
        onClose={() => setPending(null)}
      />
    </div>
  )
}
