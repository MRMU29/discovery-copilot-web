import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { requestPersistent, storageEstimate, type QuotaReport } from '@/db/quota'
import { snapshotsRepo } from '@/db/repositories'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { PageSkeleton } from '@/components/common/states'
import { downloadFile } from '@/lib/download'
import { formatWhen } from '@/lib/report-export'
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
  return bytes != null ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '未知'
}

const STRATEGY_OPTIONS: { value: ConflictStrategy; label: string; hint: string }[] = [
  { value: 'copy', label: '创建副本', hint: '冲突项目以新 ID 导入，本地原样保留（默认）' },
  { value: 'overwrite', label: '覆盖现有项目', hint: '本地数据整体替换为文件内容，导入前自动快照' },
  { value: 'skip', label: '跳过冲突项目', hint: '冲突项目不导入' },
]

const STATUS_LABELS: Record<ImportItemStatus, string> = {
  new: '新项目',
  conflict: '内容冲突',
  duplicate: '与本地一致',
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
    if (!window.confirm('清除全部项目数据（项目/假设/实验/OST/报告）？此操作不可恢复，建议先导出 .dcopilot 备份。')) return
    if (!window.confirm('再次确认：真的要清除全部项目数据吗？AI 模式、Provider 配置与引导状态会保留。')) return
    setClearing(true)
    setError(null)
    try {
      await clearProductData()
      setNotice('已清除全部项目数据；应用设置与 Provider 配置保留。')
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
      downloadFile(dcopilotFileName('全部项目备份'), JSON.stringify(file, null, 2), 'application/json')
      setNotice(`已导出 ${file.projects.length} 个项目的 .dcopilot 备份（不含 API Key）。`)
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
      const name = file.projects[0]?.name ?? '项目'
      downloadFile(dcopilotFileName(name), JSON.stringify(file, null, 2), 'application/json')
      setNotice(`已导出「${name}」的 .dcopilot 文件。`)
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
      setNotice(`已创建本地快照（${snapshot.projectCount} 个项目）。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSnapshotting(false)
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!window.confirm('删除该快照？此操作不可恢复。')) return
    setError(null)
    try {
      await snapshotsRepo.delete(id)
      setNotice('已删除快照。')
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
      setParseIssues([`文件超过 20 MB 导入上限（§5.4），已拒绝。`])
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
        `导入完成：新增 ${result.created} · 覆盖 ${result.overwritten} · 跳过 ${result.skipped}` +
          `（其中与本地一致 ${result.duplicates}）` +
          `${result.settingsRestored ? '；应用设置已恢复' : ''}` +
          `${result.snapshotId ? '；已创建覆盖前快照' : ''}。`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-headline text-ink">数据与备份</h2>

      <section aria-label="存储配额" className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">存储配额</h3>
        <p className="mt-2 text-body text-ink">
          已用 {formatBytes(quota?.usage ?? null)} / 可用配额 {formatBytes(quota?.quota ?? null)}
        </p>
        {quota?.low && (
          <p role="status" className="mt-2 text-body-sm text-warning">
            可用空间不足 50 MB：浏览器可能在存储压力下清理站点数据，请尽快导出备份。
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void handlePersist()}>
            申请持久存储
          </Button>
          {persist === 'granted' && <span className="text-body-sm text-success">已授予持久存储</span>}
          {persist === 'denied' && (
            <span className="text-body-sm text-ink-muted">未授予（浏览器可能要求更多使用痕迹）</span>
          )}
        </div>
      </section>

      <section aria-label="备份与恢复" className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">.dcopilot 备份 / 恢复</h3>
        <p className="mt-2 text-caption text-ink-faint">
          导出文件不含 API Key（Key 仅存在会话内存，从不落库）；覆盖式导入前会自动生成本地快照。
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => void handleExportAll()} disabled={exportingAll}>
            {exportingAll ? '导出中…' : '导出全部项目'}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="backup-project-select" className="text-caption text-ink-muted">
              导出单个项目（含回收站项目）
            </label>
            <select
              id="backup-project-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="mt-1 min-h-11 w-64 rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink focus:border-accent-focus focus:outline-none"
            >
              <option value="">选择项目…</option>
              {projectRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.deletedAt ? '（回收站）' : ''}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => void handleExportOne()}
            disabled={!selectedProjectId || exportingOne}
          >
            {exportingOne ? '导出中…' : '导出所选项目'}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-btn border border-hairline-strong bg-surface-2 px-4 py-2.5 text-button text-ink hover:bg-surface-3">
            导入 .dcopilot / .json 文件
            <input type="file" accept=".dcopilot,.json" onChange={handleImportFile} className="sr-only" />
          </label>
        </div>

        {parseIssues && (
          <div role="alert" className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3">
            <p className="text-body-sm font-medium text-danger">导入已拒绝（本地数据未做任何改动）：</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-caption text-ink-secondary">
              {parseIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="本地快照" className="rounded-lg border border-hairline bg-surface-1 p-4">
        <h3 className="text-eyebrow text-ink-muted">本地快照</h3>
        <p className="mt-2 text-caption text-ink-faint">
          覆盖式导入前自动创建（也可手动创建），保留最近 3 份；「恢复」走与文件导入相同的确认流程。
        </p>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void handleCreateSnapshot()} disabled={snapshotting}>
            {snapshotting ? '创建中…' : '立即创建快照'}
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="mt-3 text-caption text-ink-faint">还没有快照。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-btn border border-hairline bg-surface-2 px-3 py-2"
              >
                <span className="text-caption text-ink">
                  {formatWhen(s.createdAt)} · {s.projectCount} 个项目 ·{' '}
                  {Math.max(1, Math.round(s.payload.length / 1024))} KB
                </span>
                <span className="flex gap-2">
                  <Button variant="ghost" onClick={() => void openImport(s.payload)}>
                    恢复…
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      downloadFile(dcopilotFileName('本地快照'), s.payload, 'application/json')
                    }
                  >
                    下载
                  </Button>
                  <Button variant="ghost" onClick={() => void handleDeleteSnapshot(s.id)}>
                    删除
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="危险区" className="rounded-lg border border-danger/40 bg-surface-1 p-4">
        <h3 className="text-eyebrow text-danger">危险区</h3>
        <p className="mt-2 text-body-sm text-ink-secondary">
          清除全部项目数据（项目 / 假设 / 实验 / OST / 报告 / 评分审计）。AI 模式、Provider
          配置、新手指引状态会保留；此操作不可恢复。
        </p>
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
          {clearing ? '清除中…' : '清除项目数据…'}
        </Button>
      </section>

      <Dialog
        open={pending !== null}
        title="导入确认"
        onClose={() => {
          if (!importing) setPending(null)
        }}
      >
        {pending && (
          <div className="space-y-4">
            <div className="rounded-lg border border-hairline bg-surface-2 p-3 text-caption text-ink-secondary">
              <p className="font-medium text-ink">数据摘要</p>
              <p className="mt-1">
                项目 {pending.file.projects.length} 个（新增 {pending.summary.counts.new} · 冲突{' '}
                {pending.summary.counts.conflict} · 与本地一致 {pending.summary.counts.duplicate}）
              </p>
              <p className="mt-0.5">
                假设 {pending.summary.totals.assumptions} · 实验 {pending.summary.totals.experiments} · OST
                节点 {pending.summary.totals.ostNodes} · 报告 {pending.summary.totals.reports}
              </p>
              <p className="mt-0.5">
                应用设置：{pending.summary.hasSettings ? '文件内含' : '文件不含'}
              </p>
            </div>

            <ul className="space-y-1.5 text-caption">
              {pending.summary.items.map((item) => (
                <li key={item.project.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm text-ink">{item.project.name}</span>
                  {item.project.deletedAt && (
                    <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-ink-faint">
                      回收站
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 ${STATUS_BADGES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  {item.sameName && <span className="text-warning">本地存在同名项目</span>}
                </li>
              ))}
            </ul>

            <fieldset>
              <legend className="text-caption text-ink-muted">冲突处理（仅对冲突项目生效）</legend>
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
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-ink-muted"> — {opt.hint}</span>
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
              同时恢复应用设置（主题 / AI 模式 / 预算）
            </label>

            {error && (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={() => void handleConfirmImport()} disabled={importing}>
                {importing ? '导入中…' : '确认导入'}
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)} disabled={importing}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
