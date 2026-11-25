import { renderMarkdown } from './markdown'
import { DOCUMENT_CSS, escapeHtml, formatWhen } from './report-export'
import { LOCALE_TAGS, getLocale, translate } from './i18n'
import type { Assumption, Experiment, OstNode, Project, Report } from '@/schemas/entities'

/**
 * Read-only project package (§v0.2.4): one self-contained HTML file with the
 * whole project. Pure function — the caller aggregates rows, this module only
 * formats. Every non-Markdown value is escaped; report bodies go through
 * renderMarkdown (marked → DOMPurify), and the document carries the same
 * `default-src 'none'` CSP as report export.
 */

export const PACKAGE_MAX_BYTES = 2 * 1024 * 1024

const OST_NODE_WIDTH = 220
const OST_NODE_HEIGHT = 96

export interface ProjectPackageInput {
  project: Project
  assumptions: Assumption[]
  experiments: Experiment[]
  ostNodes: OstNode[]
  reports: Report[]
}

export function packageFileName(name: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=~^·•‧・–—…\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'project'}-package.html`
}

function typeLabel(type: Assumption['type']): string {
  return translate(type === 'go-to-market' ? 'assumption.type.goToMarket' : `assumption.type.${type}`)
}

function statusLabel(status: Experiment['status']): string {
  return translate(`experiment.status.${status}`)
}

function outcomeLabel(outcome: Experiment['outcome']): string {
  return outcome ? translate(`experiments.outcome.${outcome}`) : '—'
}

function ostTypeLabel(type: OstNode['type']): string {
  return translate(`ost.type.${type}`)
}

function confidenceLabel(confidence: number | null): string {
  return confidence === null ? '—' : `${Math.round(confidence * 100)}%`
}

/** Wraps a title into at most two SVG lines of ~13 CJK characters. */
function svgTitleLines(title: string): string[] {
  const clean = title.replace(/\s+/g, ' ').trim()
  if (clean.length <= 13) return [clean]
  return [`${clean.slice(0, 13)}…`, clean.slice(13, 26) + (clean.length > 26 ? '…' : '')]
}

const PACKAGE_CSS = `
.pkg-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.pkg-counts { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 0; padding: 0; list-style: none; }
.pkg-counts li { border: 1px solid #d3dee4; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: #494e62; }
.pkg-section { margin-top: 34px; }
.pkg-section > h2 { font-size: 19px; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #d3dee4; }
.pkg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pkg-table th, .pkg-table td { border: 1px solid #d3dee4; padding: 7px 9px; text-align: left; vertical-align: top; }
.pkg-table th { background: #f6fbfd; font-weight: 600; }
.pkg-muted { color: #5c6479; }
.pkg-ost { overflow-x: auto; border: 1px solid #d3dee4; border-radius: 10px; padding: 12px; background: #fbfdfe; }
.pkg-ost svg { display: block; max-width: none; }
.pkg-report { margin-top: 22px; padding-top: 18px; border-top: 1px dashed #d3dee4; }
.pkg-report h3 { margin: 0 0 4px; font-size: 17px; }
.pkg-empty { color: #5c6479; font-size: 13px; }
`

function renderOst(nodes: OstNode[]): string {
  if (nodes.length === 0) return `<p class="pkg-empty">${escapeHtml(translate('ost.emptyTitle'))}</p>`

  const allZero = nodes.every((node) => node.position.x === 0 && node.position.y === 0)
  const coords = new Map<string, { x: number; y: number }>()
  if (allZero) {
    // Never dragged: every node would stack at (0,0). Lay out a simple grid.
    nodes.forEach((node, index) => {
      coords.set(node.id, { x: (index % 3) * (OST_NODE_WIDTH + 60), y: Math.floor(index / 3) * (OST_NODE_HEIGHT + 70) })
    })
  } else {
    const minX = Math.min(...nodes.map((node) => node.position.x))
    const minY = Math.min(...nodes.map((node) => node.position.y))
    for (const node of nodes) {
      coords.set(node.id, { x: node.position.x - minX, y: node.position.y - minY })
    }
  }

  const padding = 20
  const width = Math.max(...[...coords.values()].map((c) => c.x)) + OST_NODE_WIDTH + padding * 2
  const height = Math.max(...[...coords.values()].map((c) => c.y)) + OST_NODE_HEIGHT + padding * 2
  const byId = new Map(nodes.map((node) => [node.id, node] as const))

  const edges: string[] = []
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const from = parent ? coords.get(parent.id) : undefined
    const to = coords.get(node.id)
    if (!from || !to) continue
    const x1 = from.x + OST_NODE_WIDTH / 2 + padding
    const y1 = from.y + OST_NODE_HEIGHT + padding
    const x2 = to.x + OST_NODE_WIDTH / 2 + padding
    const y2 = to.y + padding
    const mid = (y1 + y2) / 2
    edges.push(`<path d="M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}" fill="none" stroke="#c2cede" stroke-width="1.5" />`)
  }

  const boxes = nodes.map((node) => {
    const at = coords.get(node.id)!
    const x = at.x + padding
    const y = at.y + padding
    const lines = svgTitleLines(node.title)
    const text = lines
      .map(
        (line, index) =>
          `<text x="${x + 14}" y="${y + 46 + index * 18}" fill="#222435" font-size="13" font-family="inherit">${escapeHtml(line)}</text>`,
      )
      .join('')
    return [
      `<g>`,
      `<rect x="${x}" y="${y}" width="${OST_NODE_WIDTH}" height="${OST_NODE_HEIGHT}" rx="10" fill="#ffffff" stroke="#c2cede" />`,
      `<text x="${x + 14}" y="${y + 24}" fill="#5c6479" font-size="11" font-family="inherit">${escapeHtml(ostTypeLabel(node.type))}</text>`,
      text,
      `<title>${escapeHtml(node.title)}</title>`,
      `</g>`,
    ].join('')
  })

  return `<div class="pkg-ost"><svg role="img" aria-label="${escapeHtml(
    translate('ost.canvasAria'),
  )}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${edges.join('')}${boxes.join('')}</svg></div>`
}

function renderAssumptions(assumptions: Assumption[]): string {
  if (assumptions.length === 0) return `<p class="pkg-empty">${escapeHtml(translate('assumptions.emptyTitle'))}</p>`
  const rows = [...assumptions]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.statement)}</td><td>${escapeHtml(typeLabel(row.type))}</td><td>${row.impact}</td><td>${row.risk}</td><td>${confidenceLabel(
          row.confidence,
        )}</td><td>${row.priorityScore}</td></tr>`,
    )
    .join('')
  return `<table class="pkg-table"><thead><tr><th>${escapeHtml(translate('package.colStatement'))}</th><th>${escapeHtml(
    translate('package.colType'),
  )}</th><th>${escapeHtml(translate('package.colImpact'))}</th><th>${escapeHtml(
    translate('package.colRisk'),
  )}</th><th>${escapeHtml(translate('package.colConfidence'))}</th><th>${escapeHtml(
    translate('package.colScore'),
  )}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderExperiments(experiments: Experiment[]): string {
  if (experiments.length === 0) return `<p class="pkg-empty">${escapeHtml(translate('experiments.emptyTitle'))}</p>`
  const rows = experiments
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.hypothesis)}</td><td>${escapeHtml(row.method)}</td><td>${escapeHtml(
          statusLabel(row.status),
        )}</td><td>${escapeHtml(outcomeLabel(row.outcome))}</td><td>${escapeHtml(row.metric || '—')}</td><td>${escapeHtml(
          row.result || '—',
        )}</td></tr>`,
    )
    .join('')
  return `<table class="pkg-table"><thead><tr><th>${escapeHtml(translate('package.colHypothesis'))}</th><th>${escapeHtml(
    translate('package.colMethod'),
  )}</th><th>${escapeHtml(translate('package.colStatus'))}</th><th>${escapeHtml(
    translate('package.colOutcome'),
  )}</th><th>${escapeHtml(translate('package.colMetric'))}</th><th>${escapeHtml(
    translate('package.colResult'),
  )}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function renderReports(reports: Report[]): string {
  if (reports.length === 0) return `<p class="pkg-empty">${escapeHtml(translate('report.emptyTitle'))}</p>`
  return reports
    .map(
      (report) => `<article class="pkg-report">
<h3>${escapeHtml(report.title)}</h3>
<p class="pkg-muted">${escapeHtml(formatWhen(report.createdAt))}</p>
<div class="doc-body">${renderMarkdown(report.content)}</div>
</article>`,
    )
    .join('')
}

export function buildProjectPackageDocument(
  input: ProjectPackageInput,
  logoDataUrl?: string | null,
): string {
  const { project, assumptions, experiments, ostNodes, reports } = input
  const brand = logoDataUrl ? `<img src="${logoDataUrl}" alt="Discovery Copilot" />` : ''
  const title = escapeHtml(project.name)
  return `<!doctype html>
<html lang="${LOCALE_TAGS[getLocale()]}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'" />
<title>${title}</title>
<style>${DOCUMENT_CSS}${PACKAGE_CSS}</style>
</head>
<body>
<div class="page">
<article class="doc">
<div class="brand">${brand}<span>DISCOVERY PACKAGE · ${escapeHtml(translate('package.readOnly'))}</span></div>
<div class="pkg-head">
<h1>${title}</h1>
</div>
<p class="meta">${escapeHtml(project.description || '—')}</p>
<p class="meta">${escapeHtml(translate('package.generatedAt', { when: formatWhen(new Date().toISOString()) }))}</p>
<ul class="pkg-counts">
<li>${escapeHtml(translate('package.countAssumptions', { count: assumptions.length }))}</li>
<li>${escapeHtml(translate('package.countExperiments', { count: experiments.length }))}</li>
<li>${escapeHtml(translate('package.countNodes', { count: ostNodes.length }))}</li>
<li>${escapeHtml(translate('package.countReports', { count: reports.length }))}</li>
</ul>
<hr class="rule" />
<section class="pkg-section"><h2>${escapeHtml(translate('assumptions.title'))}</h2>${renderAssumptions(assumptions)}</section>
<section class="pkg-section"><h2>${escapeHtml(translate('experiments.title'))}</h2>${renderExperiments(experiments)}</section>
<section class="pkg-section"><h2>${escapeHtml(translate('ost.title'))}</h2>${renderOst(ostNodes)}</section>
<section class="pkg-section"><h2>${escapeHtml(translate('report.title'))}</h2>${renderReports(reports)}</section>
</article>
<p class="footer">${escapeHtml(translate('report.export.footer'))}</p>
</div>
</body>
</html>
`
}
