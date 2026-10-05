import { z } from 'zod'
import { db } from '@/db/db'
import {
  deleteProjectChildren,
  projectsRepo,
  settingsRepo,
  snapshotsRepo,
} from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { fileNameSlug } from '@/lib/report-export'
import { CAPS } from '@/lib/limits'
import {
  assumptionSchema,
  experimentSchema,
  ostNodeSchema,
  projectSchema,
  reportSchema,
  settingsRowSchema,
  snapshotSchema,
  type Assumption,
  type Experiment,
  type OstNode,
  type Project,
  type Report,
  type Snapshot,
} from '@/schemas/entities'
import { getSettings } from './settings'

/**
 * §7 .dcopilot backup / restore — the MVP's first-class migration feature.
 * File shape follows §7.2 verbatim (ost_nodes ↔ ostNodes key mapping is the
 * one documented divergence). NEVER exported: ai_requests, ai_providers,
 * score_events (§7.2 has no key for them — audit trails do not migrate),
 * the onboarding settings row and session keys.
 *
 * Import pipeline (§7.3): size guard → JSON.parse → format check →
 * formatVersion check (+ migration chain) → zod validation → file-internal
 * duplicate ids (§7.4④) → referential integrity → summary preview → user
 * confirm → single IndexedDB transaction (§7.5 rollback on any failure).
 */

export const DCOPILT_FORMAT = 'discovery-copilot'
export const DCOPILT_FORMAT_VERSION = 1
export const DCOPILT_MAX_BYTES = 20 * 1024 * 1024

export const dcopilotFileSchema = z.object({
  format: z.literal(DCOPILT_FORMAT),
  formatVersion: z.number().int(),
  appVersion: z.string(),
  exportedAt: z.string(),
  projects: z.array(projectSchema),
  assumptions: z.array(assumptionSchema),
  experiments: z.array(experimentSchema),
  ostNodes: z.array(ostNodeSchema),
  reports: z.array(reportSchema),
  settings: settingsRowSchema.omit({ key: true }).nullable(),
})

export type DcopilotFile = z.infer<typeof dcopilotFileSchema>

interface MigrationStep {
  from: number
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>
}

/**
 * AC-11 migration chain, applied stepwise until the file reaches
 * DCOPILT_FORMAT_VERSION. v0 = the command-1 probe-era payload that lacked
 * the reports/settings keys. Register future versions here — never rewrite
 * history, only append.
 */
const MIGRATIONS: MigrationStep[] = [
  {
    from: 0,
    migrate: (raw) => ({ reports: [], settings: null, ...raw, formatVersion: 1 }),
  },
]

function migrateFile(raw: Record<string, unknown>): { file: Record<string, unknown> } | { issues: string[] } {
  const declared = typeof raw.formatVersion === 'number' ? raw.formatVersion : Number.NaN
  if (Number.isInteger(declared) && declared > DCOPILT_FORMAT_VERSION) {
    return {
      issues: [
        `文件格式版本 ${declared} 高于当前应用支持的 ${DCOPILT_FORMAT_VERSION}——请先升级应用再导入。`,
      ],
    }
  }
  if (!Number.isInteger(declared)) return { file: raw } // schema validation reports this properly
  let version = declared
  let current = raw
  for (const step of [...MIGRATIONS].sort((a, b) => a.from - b.from)) {
    if (version === step.from) {
      current = step.migrate(current)
      version = step.from + 1
    }
  }
  return { file: current }
}

/** Deterministic JSON (sorted keys) — the content digest behind §7.4 conflict rules. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Builds the file for ALL projects (backup) or one project (AC-08 both
 * scopes). Rows are read raw and re-validated by dcopilotFileSchema so the
 * written file is always schema-clean.
 */
export async function buildDcopilotFile(scope: 'all' | string): Promise<DcopilotFile> {
  const allProjects = await projectsRepo.all()
  const projects = scope === 'all' ? allProjects : allProjects.filter((p) => p.id === scope)
  if (scope !== 'all' && projects.length === 0) {
    throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${scope}`)
  }
  const ids = new Set(projects.map((p) => p.id))
  const [assumptions, experiments, ostNodes, reports, settings] = await Promise.all([
    db.assumptions.toArray(),
    db.experiments.toArray(),
    db.ost_nodes.toArray(),
    db.reports.toArray(),
    getSettings(),
  ])
  return dcopilotFileSchema.parse({
    format: DCOPILT_FORMAT,
    formatVersion: DCOPILT_FORMAT_VERSION,
    appVersion: __APP_VERSION__,
    exportedAt: nowIso(),
    projects,
    assumptions: assumptions.filter((a) => ids.has(a.projectId)),
    experiments: experiments.filter((e) => ids.has(e.projectId)),
    ostNodes: ostNodes.filter((n) => ids.has(n.projectId)),
    reports: reports.filter((r) => ids.has(r.projectId)),
    settings,
  })
}

/** `名称-YYYYMMDD.dcopilot`（日期便于多份备份并存于下载目录）。 */
export function dcopilotFileName(name: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `${fileNameSlug(name, 'backup')}-${stamp}.dcopilot`
}

// ---------------------------------------------------------------------------
// Import — parse / validate / migrate
// ---------------------------------------------------------------------------

export type DcopilotParseResult = { ok: true; file: DcopilotFile } | { ok: false; issues: string[] }

export function parseDcopilotFile(
  text: string,
  options?: { maxBytes?: number },
): DcopilotParseResult {
  const maxBytes = options?.maxBytes ?? DCOPILT_MAX_BYTES
  if (text.length > maxBytes) {
    return { ok: false, issues: [`文件超过 ${Math.round(maxBytes / 1024 / 1024)} MB 导入上限（§5.4），已拒绝。`] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, issues: ['文件不是合法 JSON——可能已损坏或导出中断，请重新导出。'] }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, issues: ['文件结构不是预期的 .dcopilot 对象。'] }
  }
  const record = raw as Record<string, unknown>
  if (record.format !== DCOPILT_FORMAT) {
    return { ok: false, issues: ['format 不是 discovery-copilot——这不是本应用的备份文件。'] }
  }
  const migrated = migrateFile(record)
  if ('issues' in migrated) return { ok: false, issues: migrated.issues }

  const parsed = dcopilotFileSchema.safeParse(migrated.file)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map(
      (issue) => `字段 ${issue.path.join('.') || '(根)'}：${issue.message}`,
    )
    if (parsed.error.issues.length > 8) {
      issues.push(`……以及另外 ${parsed.error.issues.length - 8} 个校验问题`)
    }
    return { ok: false, issues: ['文件未通过 Schema 校验（§7.3），已拒绝导入：', ...issues] }
  }
  const file = parsed.data

  // §7.4 ④ duplicate ids inside the file → corrupt, reject outright.
  const tables: [string, { id: string }[]][] = [
    ['projects', file.projects],
    ['assumptions', file.assumptions],
    ['experiments', file.experiments],
    ['ostNodes', file.ostNodes],
    ['reports', file.reports],
  ]
  for (const [label, rows] of tables) {
    const seen = new Set<string>()
    for (const row of rows) {
      if (seen.has(row.id)) {
        return { ok: false, issues: [`文件损坏：${label} 内存在重复 id（${row.id}），导入已终止。`] }
      }
      seen.add(row.id)
    }
  }

  const integrityIssues = validateIntegrity(file)
  if (integrityIssues.length > 0) {
    return { ok: false, issues: ['文件内引用关系断裂，已拒绝导入：', ...integrityIssues.slice(0, 8)] }
  }
  return { ok: true, file }
}

/** Every cross-row reference must resolve inside the file AND stay intra-project. */
function validateIntegrity(file: DcopilotFile): string[] {
  const issues: string[] = []
  const projectIds = new Set(file.projects.map((p) => p.id))
  const assumptionById = new Map(file.assumptions.map((a) => [a.id, a] as const))
  const experimentIds = new Set(file.experiments.map((e) => e.id))
  const nodeById = new Map(file.ostNodes.map((n) => [n.id, n] as const))

  for (const row of file.assumptions) {
    if (!projectIds.has(row.projectId)) issues.push(`假设「${row.statement.slice(0, 16)}…」引用的项目不在文件内。`)
  }
  for (const row of file.experiments) {
    if (!projectIds.has(row.projectId)) issues.push(`实验「${row.hypothesis.slice(0, 16)}…」引用的项目不在文件内。`)
    if (row.assumptionId) {
      const target = assumptionById.get(row.assumptionId)
      if (!target) issues.push(`实验「${row.hypothesis.slice(0, 16)}…」引用的假设不在文件内。`)
      else if (target.projectId !== row.projectId) issues.push(`实验「${row.hypothesis.slice(0, 16)}…」引用了其他项目的假设。`)
    }
  }
  for (const row of file.ostNodes) {
    const label = `OST 节点「${row.title.slice(0, 16)}」`
    if (!projectIds.has(row.projectId)) issues.push(`${label}引用的项目不在文件内。`)
    if (row.parentId) {
      const parent = nodeById.get(row.parentId)
      if (!parent) issues.push(`${label}的父节点不在文件内。`)
      else if (parent.projectId !== row.projectId) issues.push(`${label}的父节点属于其他项目。`)
    }
    if (row.linkedAssumptionId && !assumptionById.get(row.linkedAssumptionId)) {
      issues.push(`${label}关联的假设不在文件内。`)
    }
    if (row.linkedExperimentId && !experimentIds.has(row.linkedExperimentId)) {
      issues.push(`${label}关联的实验不在文件内。`)
    }
  }
  for (const row of file.reports) {
    if (!projectIds.has(row.projectId)) issues.push(`报告「${row.title.slice(0, 16)}…」引用的项目不在文件内。`)
  }
  return issues
}

// ---------------------------------------------------------------------------
// Import — conflict analysis (§7.4) and apply (§7.5)
// ---------------------------------------------------------------------------

export type ConflictStrategy = 'copy' | 'overwrite' | 'skip'
export type ImportItemStatus = 'new' | 'conflict' | 'duplicate'

export interface ImportItem {
  project: Project
  status: ImportItemStatus
  /** §7.4 ③ same name, different id — informational, never blocks. */
  sameName: boolean
}

export interface ImportSummary {
  items: ImportItem[]
  counts: { new: number; conflict: number; duplicate: number }
  totals: { assumptions: number; experiments: number; ostNodes: number; reports: number }
  hasSettings: boolean
}

interface ProjectChildren {
  assumptions: Assumption[]
  experiments: Experiment[]
  ostNodes: OstNode[]
  reports: Report[]
}

function childrenOfInFile(file: DcopilotFile, projectId: string): ProjectChildren {
  return {
    assumptions: file.assumptions.filter((a) => a.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    experiments: file.experiments.filter((e) => e.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    ostNodes: file.ostNodes.filter((n) => n.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    reports: file.reports.filter((r) => r.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
  }
}

/** Content digest = project row + all child rows (sorted), stable-stringified. */
function projectDigest(project: Project, children: ProjectChildren): string {
  return stableStringify({ project, ...children })
}

export async function summarizeImport(file: DcopilotFile): Promise<ImportSummary> {
  const [localProjects, localAssumptions, localExperiments, localNodes, localReports] = await Promise.all([
    db.projects.toArray(),
    db.assumptions.toArray(),
    db.experiments.toArray(),
    db.ost_nodes.toArray(),
    db.reports.toArray(),
  ])
  const localById = new Map(localProjects.map((p) => [p.id, p] as const))
  const localChildrenOf = (projectId: string): ProjectChildren => ({
    assumptions: localAssumptions.filter((a) => a.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    experiments: localExperiments.filter((e) => e.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    ostNodes: localNodes.filter((n) => n.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
    reports: localReports.filter((r) => r.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id)),
  })

  const items: ImportItem[] = file.projects.map((project) => {
    const existing = localById.get(project.id)
    if (!existing) {
      const sameName = localProjects.some((l) => l.id !== project.id && l.name === project.name)
      return { project, status: 'new', sameName }
    }
    const incomingDigest = projectDigest(project, childrenOfInFile(file, project.id))
    const localDigest = projectDigest(existing, localChildrenOf(project.id))
    return { project, status: incomingDigest === localDigest ? 'duplicate' : 'conflict', sameName: false }
  })

  return {
    items,
    counts: {
      new: items.filter((i) => i.status === 'new').length,
      conflict: items.filter((i) => i.status === 'conflict').length,
      duplicate: items.filter((i) => i.status === 'duplicate').length,
    },
    totals: {
      assumptions: file.assumptions.length,
      experiments: file.experiments.length,
      ostNodes: file.ostNodes.length,
      reports: file.reports.length,
    },
    hasSettings: file.settings !== null,
  }
}

export interface ImportOptions {
  conflictStrategy: ConflictStrategy
  restoreSettings: boolean
}

export interface ImportResult {
  created: number
  overwritten: number
  skipped: number
  duplicates: number
  settingsRestored: boolean
  snapshotId: string | null
}

/**
 * Applies the file in ONE transaction (§7.5): any failure rolls back every
 * write. Overwrite conflicts first produce a local snapshot (§7.6). Copy
 * strategy re-issues ids for the project AND every child row, remapping all
 * FKs — a copy must never collide with the original's rows.
 */
export async function applyImport(file: DcopilotFile, options: ImportOptions): Promise<ImportResult> {
  const summary = await summarizeImport(file)
  const added = summary.counts.new + summary.items.filter((i) => i.status === 'conflict' && options.conflictStrategy === 'copy').length
  const localCount = await projectsRepo.countAll()
  if (localCount + added > CAPS.projects) {
    throw new DomainError('CAPACITY_LIMIT', `导入后项目总数将超过上限 ${CAPS.projects}，请减少导入范围。`)
  }

  const result: ImportResult = {
    created: 0,
    overwritten: 0,
    skipped: 0,
    duplicates: 0,
    settingsRestored: false,
    snapshotId: null,
  }
  const willOverwrite =
    options.conflictStrategy === 'overwrite' && summary.counts.conflict > 0
  if (willOverwrite) {
    const snapshot = await createSnapshot()
    result.snapshotId = snapshot.id
  }

  await db.transaction(
    'rw',
    // score_events joins because deleteProjectChildren (overwrite path) clears it.
    [db.projects, db.assumptions, db.experiments, db.ost_nodes, db.reports, db.score_events, db.settings],
    async () => {
      for (const item of summary.items) {
        const incoming = childrenOfInFile(file, item.project.id)
        if (item.status === 'duplicate' || (item.status === 'conflict' && options.conflictStrategy === 'skip')) {
          result.skipped += 1
          if (item.status === 'duplicate') result.duplicates += 1
          continue
        }
        if (item.status === 'conflict' && options.conflictStrategy === 'overwrite') {
          await deleteProjectChildren(item.project.id)
          await projectsRepo.put(item.project)
          await bulkPutChildren(incoming)
          result.overwritten += 1
          continue
        }
        if (item.status === 'conflict' && options.conflictStrategy === 'copy') {
          const copy = remapProjectCopy(item.project, incoming)
          await projectsRepo.put(copy.project)
          await bulkPutChildren(copy.children)
          result.created += 1
          continue
        }
        // status === 'new'
        await projectsRepo.put(item.project)
        await bulkPutChildren(incoming)
        result.created += 1
      }
      if (options.restoreSettings && file.settings) {
        await settingsRepo.put(settingsRowSchema.parse({ ...file.settings, key: 'app' }))
        result.settingsRestored = true
      }
    },
  )
  return result
}

async function bulkPutChildren(children: ProjectChildren): Promise<void> {
  if (children.assumptions.length > 0) await db.assumptions.bulkPut(children.assumptions)
  if (children.experiments.length > 0) await db.experiments.bulkPut(children.experiments)
  if (children.ostNodes.length > 0) await db.ost_nodes.bulkPut(children.ostNodes)
  if (children.reports.length > 0) await db.reports.bulkPut(children.reports)
}

function remapProjectCopy(
  project: Project,
  children: ProjectChildren,
): { project: Project; children: ProjectChildren } {
  const projectId = crypto.randomUUID()
  const idMap = new Map<string, string>()
  for (const row of [...children.assumptions, ...children.experiments, ...children.ostNodes, ...children.reports]) {
    idMap.set(row.id, crypto.randomUUID())
  }
  const remap = (id: string | null): string | null => (id ? (idMap.get(id) ?? null) : null)
  return {
    project: { ...project, id: projectId },
    children: {
      assumptions: children.assumptions.map((a) => ({ ...a, id: remap(a.id)!, projectId })),
      experiments: children.experiments.map((e) => ({
        ...e,
        id: remap(e.id)!,
        projectId,
        assumptionId: remap(e.assumptionId),
      })),
      ostNodes: children.ostNodes.map((n) => ({
        ...n,
        id: remap(n.id)!,
        projectId,
        parentId: remap(n.parentId),
        linkedAssumptionId: remap(n.linkedAssumptionId),
        linkedExperimentId: remap(n.linkedExperimentId),
      })),
      reports: children.reports.map((r) => ({ ...r, id: remap(r.id)!, projectId })),
    },
  }
}

// ---------------------------------------------------------------------------
// Snapshots (§7.6)
// ---------------------------------------------------------------------------

export async function createSnapshot(): Promise<Snapshot> {
  const file = await buildDcopilotFile('all')
  const row = snapshotSchema.parse({
    id: crypto.randomUUID(),
    createdAt: nowIso(),
    payload: JSON.stringify(file),
    projectCount: file.projects.length,
    appVersion: file.appVersion,
  })
  await snapshotsRepo.put(row)
  await snapshotsRepo.prune(3)
  return row
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return snapshotsRepo.list()
}
