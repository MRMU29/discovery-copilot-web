import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Button } from '@/components/ui/Button'
import { downloadDataUrl, downloadFile } from '@/lib/download'
import { clearReportDraft, loadReportDraft, saveReportDraft } from '@/lib/report-draft'
import { renderMarkdown } from '@/lib/markdown'
import {
  buildReportHtmlDocument,
  loadBrandLogoDataUrl,
  reportFileName,
  reportMetaLine,
} from '@/lib/report-export'
import type { Report } from '@/schemas/entities'
import { deleteReport, updateReport } from '@/services/reports'

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
  const docRef = useRef<HTMLDivElement>(null)
  const draftTimerRef = useRef<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(report.title)
  const [editContent, setEditContent] = useState(report.content)
  const [saving, setSaving] = useState(false)
  const [busyExport, setBusyExport] = useState<'html' | 'png' | null>(null)
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
      setNotice('已恢复上次未保存的编辑草稿；保存或取消后草稿清除。')
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
      setNotice('已保存修改。')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`删除报告「${report.title}」？此操作不可恢复。`)) return
    try {
      await deleteReport(report.id)
      clearReportDraft(report.id)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleExportHtml() {
    setBusyExport('html')
    setError(null)
    setNotice(null)
    try {
      const logo = await loadBrandLogoDataUrl()
      const html = buildReportHtmlDocument({ ...report, projectName: projectName ?? '未命名项目' }, logo)
      downloadFile(reportFileName(report.title, 'html'), html, 'text/html;charset=utf-8')
      setNotice('已导出 HTML（自包含样式，可离线打开与分享）。')
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
      setNotice('已导出 PNG（尽力而为路径，建议检查中文与版式保真）。')
    } catch (err) {
      setError('PNG 导出失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusyExport(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← 返回列表
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void handleExportHtml()} disabled={busyExport !== null || editing}>
            {busyExport === 'html' ? '导出中…' : '导出 HTML'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleExportPng()}
            disabled={busyExport !== null || editing}
            title="尽力而为路径：复杂样式（渐变/特殊字体）可能有偏差，保真分享请用 HTML"
          >
            {busyExport === 'png' ? '导出中…' : '导出 PNG'}
          </Button>
          <Button
            variant="secondary"
            onClick={onAiRewrite}
            disabled={busyExport !== null || editing}
            title="基于项目已确认数据重新生成本报告内容，应用前先审核"
          >
            AI 重写
          </Button>
          {editing ? (
            <>
              <Button onClick={() => void handleSave()} disabled={saving || !editTitle.trim()}>
                {saving ? '保存中…' : '保存'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  clearReportDraft(report.id)
                  setEditing(false)
                  resetEditState()
                }}
              >
                取消
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={startEditing}
            >
              编辑
            </Button>
          )}
          <Button variant="danger" onClick={() => void handleDelete()} disabled={editing}>
            删除
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
              标题
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
              正文（Markdown）
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
            {projectName && <p className="mt-1 text-caption text-reading-ink-secondary">项目：{projectName}</p>}
            <p className="text-caption text-reading-ink-secondary">{reportMetaLine(report)}</p>
          </div>
          <hr className="mx-6 border-reading-border sm:mx-9" />
          <div
            className="reading-prose px-6 py-4 pb-8 sm:px-9"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.content) }}
          />
        </div>
      )}
    </div>
  )
}
