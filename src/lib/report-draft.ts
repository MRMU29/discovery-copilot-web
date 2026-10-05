const PREFIX = 'dcopilot.draft.report.'

export interface ReportDraftContent {
  title: string
  content: string
}

/**
 * Unsaved report edits live in localStorage as best-effort drafts so a
 * refresh (or accidental close) doesn't lose work. This is UI scratch
 * space, not business data — the source of truth stays in IndexedDB and
 * drafts are cleared on save / explicit cancel / report deletion.
 */

export function loadReportDraft(reportId: string): ReportDraftContent | null {
  try {
    const raw = localStorage.getItem(PREFIX + reportId)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const candidate = parsed as Partial<ReportDraftContent> | null
    if (candidate && typeof candidate.title === 'string' && typeof candidate.content === 'string') {
      return { title: candidate.title, content: candidate.content }
    }
    return null
  } catch {
    return null
  }
}

export function saveReportDraft(reportId: string, draft: ReportDraftContent): void {
  try {
    localStorage.setItem(PREFIX + reportId, JSON.stringify(draft))
  } catch {
    // best-effort only (quota/private mode) — losing a draft beats breaking edit
  }
}

export function clearReportDraft(reportId: string): void {
  try {
    localStorage.removeItem(PREFIX + reportId)
  } catch {
    // ignore
  }
}
