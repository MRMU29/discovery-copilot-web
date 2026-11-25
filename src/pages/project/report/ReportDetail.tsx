import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { downloadDataUrl, downloadFile } from '@/lib/download'
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/report-draft'
import { renderMarkdown } from '@/lib/markdown'
import {
  buildReportHtmlDocument,
  buildReportJson,
  buildReportMarkdown,
  loadBrandLogoDataUrl,
  reportFileName,
  reportMetaLine,
} from '@/lib/report-export'
import type { Report } from '@/schemas/entities'
import { deleteReport, updateReport } from '@/services/reports'
import { confirmAction } from '@/lib/confirm'
import { useT } from '@/lib/i18n'

interface ReportDetailProps {
  report: Report
  projectName?: string
  onBack: () => void
  /** 打开 AI 重写对话框（覆盖更新本报告，应用前仍走审核）。 */
  onAiRewrite: () => void
}

/**
 * Report reading surface: toolbar + document card. The card is also the PNG
 * capture target and the visual contract the HTML export mirrors (AC-13:
 * HTML = fidelity path, PNG = best-effort).
 */
export function ReportDetail({ report, projectName, onBack, onAiRewrite }: ReportDetailProps) {
  const t = useT()
  const docRef = useRef<HTMLDivElement>(null)
  const draftTimerRef = useRef<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(report.title)
  const [editContent, setEditContent] = useState(report.content)
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [watermark, setWatermark] = useState(true)
  const [busyExport, setBusyExport] = useState<'html' | 'png' | 'md' | 'json' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function resetEditState() {
    setEditTitle(report.title)
    setEditContent(report.content)
  }

  // 编辑中草稿自动落 localStorage（debounce 800ms）——刷新/误关不丢改动。
  useEffect(() => {
    if (!editing) return
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current)
    draftTimerRef.current = window.setTimeout(() => {
      saveReportDraft(report.id, { title: editTitle, content: editContent })
    }, 800)
    return () => {
      if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current)
    }
  }, [editing, editTitle, editContent, report.id])

  function startEditing() {
    const draft = loadReportDraft(report.id)
    if (draft) {
      setEditTitle(draft.title)
      setEditContent(draft.content)
      setNotice(t('report.draftRestored'))
    } else {
      resetEditState()
    }
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateReport(report.id, {
        title: editTitle.trim() || report.title,
        content: editContent,
      })
      clearReportDraft(report.id)
      setEditing(false)
      setNotice(t('report.savedNotice'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!(await confirmAction({ title: t('confirm.deleteTitle'), body: t('report.deleteConfirm', { title: report.title }), tone: 'danger' }))) return
    try {
      await deleteReport(report.id)
      clearReportDraft(report.id)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /** All four formats share the same provenance input (project name fallback included). */
  function exportInput() {
    return { ...report, projectName: projectName ?? t('report.unnamedProject') }
  }

  async function handleExportHtml() {
    setBusyExport('html')
    setError(null)
    setNotice(null)
    try {
      const logo = await loadBrandLogoDataUrl()
      const html = buildReportHtmlDocument(exportInput(), logo, { watermark })
      downloadFile(reportFileName(report.title, 'html'), html, 'text/html;charset=utf-8')
      setExportOpen(false)
      setNotice(t('report.exportedHtml'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyExport(null)
    }
  }

  function handleExportMarkdown() {
    setBusyExport('md')
    setError(null)
    setNotice(null)
    try {
      const md = buildReportMarkdown(exportInput())
      downloadFile(reportFileName(report.title, 'md'), md, 'text/markdown;charset=utf-8')
      setExportOpen(false)
      setNotice(t('report.exportedMarkdown'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyExport(null)
    }
  }

  function handleExportJson() {
    setBusyExport('json')
    setError(null)
    setNotice(null)
    try {
      const json = buildReportJson(exportInput())
      downloadFile(reportFileName(report.title, 'json'), json, 'application/json;charset=utf-8')
      setExportOpen(false)
      setNotice(t('report.exportedJson'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyExport(null)
    }
  }

  async function handleExportPng() {
    const node = docRef.current
    if (!node) return
    setBusyExport('png')
    setError(null)
    setNotice(null)
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true })
      downloadDataUrl(reportFileName(report.title, 'png'), dataUrl)
      setExportOpen(false)
      setNotice(t('report.exportedPng'))
    } catch (err) {
      setError(t('report.exportPngFailed') + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusyExport(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {t('report.backList')}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setExportOpen(true)}
            disabled={busyExport !== null || editing}
          >
            {busyExport !== null ? t('report.exporting') : t('report.exportMenu')}
          </Button>
          <Button
            variant="secondary"
            onClick={onAiRewrite}
            disabled={busyExport !== null || editing}
            title={t('report.aiRewriteTitle')}
          >
            {t('report.aiRewrite')}
          </Button>
          {editing ? (
            <>
              <Button onClick={() => void handleSave()} disabled={saving || !editTitle.trim()}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clearReportDraft(report.id)
                  setEditing(false)
                  resetEditState()
                }}
              >
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={startEditing}
            >
              {t('common.edit')}
            </Button>
          )}
          <Button variant="danger" onClick={() => void handleDelete()} disabled={editing}>
            {t('common.delete')}
          </Button>
        </div>
      </div>

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

      {editing ? (
        <div className="space-y-3 rounded-lg border border-hairline bg-surface-1 p-4">
          <div>
            <label htmlFor="report-edit-title" className="text-caption text-ink-muted">
              {t('report.titleLabel')}
            </label>
            <input
              id="report-edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-ink focus:border-accent-focus focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="report-edit-content" className="text-caption text-ink-muted">
              {t('report.contentLabelShort')}
            </label>
            <textarea
              id="report-edit-content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={16}
              className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-2 px-3 py-2 font-mono text-body-sm text-ink focus:border-accent-focus focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div ref={docRef} className="reading-surface overflow-hidden rounded-lg border border-hairline shadow-card">
          <div className="px-6 pb-1 pt-7 sm:px-9">
            <p className="text-xs font-semibold uppercase tracking-wider text-reading-ink-secondary">
              Discovery Report
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight text-reading-ink">{report.title}</h1>
            {projectName && <p className="mt-1 text-caption text-reading-ink-secondary">{t('report.projectLabel')}{projectName}</p>}
            <p className="text-caption text-reading-ink-secondary">{reportMetaLine(report)}</p>
          </div>
          <hr className="mx-6 border-reading-border sm:mx-9" />
          <div
            className="reading-prose px-6 py-4 pb-8 sm:px-9"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
          />
        </div>
      )}

      {/*
        One entry point for all four formats (§roadmap 3.4): the toolbar used to
        grow a button per format, which does not fit a 375px screen and made the
        fidelity differences invisible. The dialog states them once.
      */}
      <Dialog
        open={exportOpen}
        title={t('report.exportDialogTitle')}
        onClose={() => setExportOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ink-muted">{t('report.exportDialogIntro')}</p>
          <label className="flex items-start gap-2 text-body-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={watermark}
              onChange={(event) => setWatermark(event.target.checked)}
              className="mt-1 size-4 accent-accent"
            />
            <span>
              {t('report.export.watermarkToggle')}
              <span className="mt-0.5 block text-caption text-ink-faint">
                {t('report.export.watermarkHint')}
              </span>
            </span>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => void handleExportHtml()} disabled={busyExport !== null}>
              {busyExport === 'html' ? t('report.exporting') : t('report.exportHtml')}
            </Button>
            <Button variant="secondary" onClick={handleExportMarkdown} disabled={busyExport !== null}>
              {busyExport === 'md' ? t('report.exporting') : t('report.exportMarkdown')}
            </Button>
            <Button variant="secondary" onClick={handleExportJson} disabled={busyExport !== null}>
              {busyExport === 'json' ? t('report.exporting') : t('report.exportJson')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleExportPng()}
              disabled={busyExport !== null}
              title={t('report.pngTitle')}
            >
              {busyExport === 'png' ? t('report.exporting') : t('report.exportPng')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
