import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { reportMetaLine } from '@/lib/report-export'
import type { Report } from '@/schemas/entities'
import { getProject } from '@/services/projects'
import { createReport, deleteReport, listReportsByProject } from '@/services/reports'
import { useT } from '@/lib/i18n'
import { AIReportDialog } from './report/AIReportDialog'
import { ReportDetail } from './report/ReportDetail'

export default function Report({ projectId }: { projectId: string }) {
  const t = useT()
  const reports = useLiveQuery(() => listReportsByProject(projectId), [projectId])
  const project = useLiveQuery(async () => {
    try {
      const p = await getProject(projectId)
      return p ? { name: p.name } : null
    } catch {
      return null
    }
  }, [projectId])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiTarget, setAiTarget] = useState<Report | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (reports === undefined) return <PageSkeleton />
  const projectName = project?.name
  const selected = selectedId ? (reports.find((r) => r.id === selectedId) ?? null) : null

  // Shared by the list and detail views — the detail view early-returns.
  const aiDialog = aiOpen ? (
    <AIReportDialog
      projectId={projectId}
      projectName={projectName}
      targetReport={aiTarget ?? undefined}
      onClose={() => {
        setAiOpen(false)
        setAiTarget(null)
      }}
      onApplied={(report, mode) => {
        setSelectedId(report.id)
        setAiTarget(null)
        setNotice(mode === 'updated' ? t('report.noticeUpdated') : t('report.noticeCreated'))
      }}
    />
  ) : null

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    setFormError(null)
    try {
      await createReport(projectId, {
        title: newTitle.trim(),
        content: newContent,
        generatedAt: null,
        generatedSections: [],
      })
      setNewOpen(false)
      setNewTitle('')
      setNewContent('')
      setNotice(t('report.createdNotice'))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(report: Report) {
    if (!window.confirm(t('report.deleteConfirm', { title: report.title }))) return
    try {
      await deleteReport(report.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (selected) {
    return (
      <>
        {aiDialog}
        {notice && (
          <div role="status" className="rounded-lg border border-success/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
            {notice}
          </div>
        )}
        <ReportDetail
          key={selected.id}
          report={selected}
          projectName={projectName}
          onBack={() => {
            setSelectedId(null)
            setNotice(null)
          }}
          onAiRewrite={() => {
            setAiTarget(selected)
            setAiOpen(true)
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-ink">{t('report.title')}</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            {t('report.desc', { count: reports.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAiOpen(true)}>{t('report.aiCta')}</Button>
          <Button variant="secondary" onClick={() => setNewOpen(true)}>
            {t('report.newCta')}
          </Button>
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-success/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {notice}
        </div>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <EmptyState
          title={t('report.emptyTitle')}
          description={t('report.emptyDesc')}
          action={<Button onClick={() => setAiOpen(true)}>{t('report.emptyCta')}</Button>}
        />
      ) : (
        <section aria-label={t('report.listAria')} className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-hairline bg-surface-1 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(r.id)
                    setNotice(null)
                    setError(null)
                  }}
                  className="text-left text-card-title text-ink hover:text-accent-hover"
                >
                  {r.title}
                </button>
                <Button variant="ghost" onClick={() => void handleDelete(r)}>
                  {t('common.delete')}
                </Button>
              </div>
              <p className="mt-1 text-caption text-ink-muted">{reportMetaLine(r)}</p>
              {r.generatedSections.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.generatedSections.slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-caption text-ink-secondary"
                    >
                      {s}
                    </span>
                  ))}
                  {r.generatedSections.length > 5 && (
                    <span className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-caption text-ink-faint">
                      +{r.generatedSections.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <Dialog open={newOpen} title={t('report.newTitle')} onClose={() => setNewOpen(false)}>
        <div className="space-y-3">
          <div>
            <label htmlFor="new-report-title" className="text-caption text-ink-muted">
              {t('report.titleLabel')}
            </label>
            <input
              id="new-report-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={200}
              placeholder={t('report.titlePlaceholder')}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="new-report-content" className="text-caption text-ink-muted">
              {t('report.contentLabel')}
            </label>
            <textarea
              id="new-report-content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={8}
              placeholder={'## 背景\n…'}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 font-mono text-body-sm text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
            />
          </div>
          {formError && (
            <p role="alert" className="text-body-sm text-danger">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void handleCreate()} disabled={creating || !newTitle.trim()}>
              {creating ? t('common.saving2') : t('report.create')}
            </Button>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Dialog>

      {aiDialog}
    </div>
  )
}
