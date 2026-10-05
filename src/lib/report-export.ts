import { renderMarkdown } from './markdown'
import { BRAND_ICON_URL } from './brand'

/**
 * Report export + shared report display helpers (AC-07 / AC-13). HTML export
 * is the fidelity-guaranteed path: a single self-contained file with inlined
 * CSS (Notion light reading rules, matching the app's reading-* tokens) so it
 * renders identically offline in any browser. PNG stays best-effort via
 * html-to-image at the call site (known limits: exotic CSS/fonts).
 */

export interface ReportDisplayFields {
  generatedAt: string | null
  generatedSections: string[]
  createdAt: string
  updatedAt: string
}

/** AC-07 区分 AI 生成与用户确认：编辑时间晚于生成（或手动创建）时间即用户确认过。
 * 1s 容差吸收同一动作内两次 nowIso() 的毫秒偏差（应用草稿时 updatedAt/generatedAt 同秒）。 */
export function isUserEdited(report: ReportDisplayFields): boolean {
  return Date.parse(report.updatedAt) > Date.parse(report.generatedAt ?? report.createdAt) + 1000
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** One-line provenance for the detail page header and the exported document. */
export function reportMetaLine(report: ReportDisplayFields): string {
  const edited = isUserEdited(report) ? ` · 你已编辑于 ${formatWhen(report.updatedAt)}` : ''
  if (report.generatedAt) {
    const sections =
      report.generatedSections.length > 0 ? `（节：${report.generatedSections.join('、')}）` : ''
    return `AI 生成于 ${formatWhen(report.generatedAt)}${sections}${edited}`
  }
  return `手动创建于 ${formatWhen(report.createdAt)}${edited}`
}

/** Filesystem-safe name segment; CJK is kept (Windows/Android handle it fine). */
export function fileNameSlug(name: string, fallback: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=~^·•‧・–—…\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || fallback
}

export function reportFileName(title: string, ext: string): string {
  return `${fileNameSlug(title, 'report')}.${ext}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const DOCUMENT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #f6f5f4;
  color: #37352f;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.page { max-width: 780px; margin: 0 auto; padding: 48px 20px 32px; }
.doc {
  background: #ffffff;
  border: 1px solid #e9e7e4;
  border-radius: 10px;
  padding: 44px 52px 36px;
}
.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; }
.brand img { width: 28px; height: 28px; border-radius: 6px; }
.brand span { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; color: #9b9a97; }
h1 { font-size: 26px; line-height: 1.3; margin: 0 0 8px; color: #1f1e1d; }
.meta { font-size: 13px; color: #787774; margin: 0 0 6px; }
.rule { border: none; border-top: 1px solid #e9e7e4; margin: 24px 0 8px; }
.doc-body h2 {
  font-size: 20px; line-height: 1.4; margin: 30px 0 10px;
  padding-bottom: 6px; border-bottom: 1px solid #efefee; color: #1f1e1d;
}
.doc-body h3 { font-size: 17px; margin: 22px 0 8px; color: #1f1e1d; }
.doc-body p { margin: 10px 0; }
.doc-body ul, .doc-body ol { padding-left: 24px; margin: 10px 0; }
.doc-body li { margin: 4px 0; }
.doc-body table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
.doc-body th, .doc-body td { border: 1px solid #e9e7e4; padding: 8px 10px; text-align: left; }
.doc-body th { background: #f6f5f4; }
.doc-body blockquote {
  border-left: 3px solid #e9e7e4; margin: 12px 0; padding: 2px 14px; color: #787774;
}
.doc-body code { background: #f6f5f4; border-radius: 4px; padding: 2px 5px; font-size: 0.9em; }
.doc-body pre { background: #f6f5f4; border-radius: 8px; padding: 14px; overflow: auto; }
.doc-body pre code { background: none; padding: 0; }
.doc-body hr { border: none; border-top: 1px solid #e9e7e4; margin: 24px 0; }
.footer { font-size: 12px; color: #9b9a97; text-align: center; padding: 20px 0 8px; }
`

export interface ReportExportInput extends ReportDisplayFields {
  title: string
  content: string
  projectName: string
}

/**
 * Self-contained share file: sanitized body + inlined styles + provenance
 * header. Nothing external is referenced, so the file renders offline.
 */
export function buildReportHtmlDocument(input: ReportExportInput, logoDataUrl?: string | null): string {
  const brand = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Discovery Copilot" />`
    : ''
  const title = escapeHtml(input.title)
  const projectName = escapeHtml(input.projectName)
  const meta = escapeHtml(reportMetaLine(input))
  const body = renderMarkdown(input.content)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${DOCUMENT_CSS}</style>
</head>
<body>
<div class="page">
<article class="doc">
<div class="brand">${brand}<span>DISCOVERY REPORT</span></div>
<h1>${title}</h1>
<p class="meta">项目：${projectName}</p>
<p class="meta">${meta}</p>
<hr class="rule" />
<div class="doc-body">
${body}
</div>
</article>
<p class="footer">由 Discovery Copilot 导出 · 本地优先产品发现工作台</p>
</div>
</body>
</html>
`
}

let logoCache: string | null | undefined

/** Inlines the app brand icon into the exported HTML; failures degrade to text-only. */
export async function loadBrandLogoDataUrl(): Promise<string | null> {
  if (logoCache !== undefined) return logoCache
  try {
    const res = await fetch(BRAND_ICON_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    logoCache = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    logoCache = null
  }
  return logoCache
}
