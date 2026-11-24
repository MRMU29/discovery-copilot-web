import { db } from '@/db/db'
import { CAPS } from '@/lib/limits'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { decisionSchema, experimentSchema, ostNodeSchema } from '@/schemas/entities'

/**
 * Local data self-check (§roadmap 3.3). The browser holds the only copy, so a
 * corrupt reference currently surfaces as `CORRUPT_ROW` with no way out. This
 * service *reports* (read-only) and repairs one issue at a time — there is no
 * "fix everything" path on purpose: every repair is a destructive write.
 */

export type HealthTable = 'assumptions' | 'experiments' | 'ost_nodes' | 'reports' | 'decisions'

export type HealthIssueKind = 'orphan' | 'broken-link' | 'cycle' | 'over-capacity'

/** Which reference a `broken-link` issue is about (decisions carry arrays). */
export type HealthLinkField =
  | 'assumptionId'
  | 'parentId'
  | 'linkedAssumptionId'
  | 'linkedExperimentId'
  | 'linkedAssumptionIds'
  | 'linkedExperimentIds'

export interface HealthIssue {
  kind: HealthIssueKind
  table: HealthTable
  entityId: string
  /** Owning project; null when the row points at a project that no longer exists. */
  projectId: string | null
  /** Raw field for display only — never UI copy. */
  label: string
  detail?: {
    field?: HealthLinkField
    refId?: string
    parentId?: string | null
    count?: number
    limit?: number
    projectName?: string
  }
}

export interface HealthReport {
  scannedAt: string
  issues: HealthIssue[]
  counts: Record<'projects' | 'assumptions' | 'experiments' | 'ostNodes' | 'reports' | 'decisions', number>
}

const CHILD_TABLES: HealthTable[] = ['assumptions', 'experiments', 'ost_nodes', 'reports', 'decisions']

function labelOf(table: HealthTable, row: unknown): string {
  const record = row as Record<string, unknown>
  const value =
    table === 'assumptions' || table === 'decisions'
      ? record.statement
      : table === 'experiments'
        ? record.hypothesis
        : record.title
  return typeof value === 'string' ? value : String(record.id ?? '')
}

/** One representative node per cycle (smallest id), so a 2-node loop is one issue. */
function findCycleRepresentatives(nodes: { id: string; parentId: string | null }[]): string[] {
  const parent = new Map(nodes.map((node) => [node.id, node.parentId] as const))
  const reported = new Set<string>()
  const representatives: string[] = []

  for (const node of nodes) {
    const path: string[] = []
    const seen = new Map<string, number>()
    let cursor: string | null = node.id
    while (cursor) {
      const at = seen.get(cursor)
      if (at !== undefined) {
        const cycle = path.slice(at)
        const representative = [...cycle].sort()[0]
        if (!reported.has(representative)) {
          reported.add(representative)
          representatives.push(representative)
        }
        break
      }
      seen.set(cursor, path.length)
      path.push(cursor)
      cursor = parent.get(cursor) ?? null
    }
  }
  return representatives
}

/** Read-only: every query here is a plain table scan inside its own read transaction. */
export async function scanDataHealth(): Promise<HealthReport> {
  const [projects, assumptions, experiments, ostNodes, reports, decisions] = await Promise.all([
    db.projects.toArray(),
    db.assumptions.toArray(),
    db.experiments.toArray(),
    db.ost_nodes.toArray(),
    db.reports.toArray(),
    db.decisions.toArray(),
  ])

  // A project in the recycle bin is still a legitimate parent.
  const projectIds = new Set(projects.map((p) => p.id))
  const projectNames = new Map(projects.map((p) => [p.id, p.name] as const))
  const issues: HealthIssue[] = []

  const rowsByTable: Record<HealthTable, { id: string; projectId: string }[]> = {
    assumptions,
    experiments,
    ost_nodes: ostNodes,
    reports,
    decisions,
  }

  for (const table of CHILD_TABLES) {
    for (const row of rowsByTable[table]) {
      if (projectIds.has(row.projectId)) continue
      issues.push({
        kind: 'orphan',
        table,
        entityId: (row as { id: string }).id,
        projectId: null,
        label: labelOf(table, row),
      })
    }
  }

  // Same-project reference maps: a link to another project's row is broken too.
  const idsByProject = <T extends { id: string; projectId: string }>(rows: T[]) => {
    const map = new Map<string, Set<string>>()
    for (const row of rows) {
      const set = map.get(row.projectId) ?? new Set<string>()
      set.add(row.id)
      map.set(row.projectId, set)
    }
    return map
  }
  const assumptionIds = idsByProject(assumptions)
  const experimentIds = idsByProject(experiments)
  const ostIdsByProject = idsByProject(ostNodes)

  const existsIn = (map: Map<string, Set<string>>, projectId: string, id: string | null) =>
    id === null || (map.get(projectId)?.has(id) ?? false)

  for (const experiment of experiments) {
    if (existsIn(assumptionIds, experiment.projectId, experiment.assumptionId)) continue
    issues.push({
      kind: 'broken-link',
      table: 'experiments',
      entityId: experiment.id,
      projectId: experiment.projectId,
      label: experiment.hypothesis,
      detail: { field: 'assumptionId', refId: experiment.assumptionId ?? undefined },
    })
  }

  for (const node of ostNodes) {
    if (node.parentId !== null && !existsIn(ostIdsByProject, node.projectId, node.parentId)) {
      issues.push({
        kind: 'broken-link',
        table: 'ost_nodes',
        entityId: node.id,
        projectId: node.projectId,
        label: node.title,
        detail: { field: 'parentId', refId: node.parentId },
      })
    }
    if (node.linkedAssumptionId !== null && !existsIn(assumptionIds, node.projectId, node.linkedAssumptionId)) {
      issues.push({
        kind: 'broken-link',
        table: 'ost_nodes',
        entityId: node.id,
        projectId: node.projectId,
        label: node.title,
        detail: { field: 'linkedAssumptionId', refId: node.linkedAssumptionId },
      })
    }
    if (node.linkedExperimentId !== null && !existsIn(experimentIds, node.projectId, node.linkedExperimentId)) {
      issues.push({
        kind: 'broken-link',
        table: 'ost_nodes',
        entityId: node.id,
        projectId: node.projectId,
        label: node.title,
        detail: { field: 'linkedExperimentId', refId: node.linkedExperimentId },
      })
    }
  }

  for (const decision of decisions) {
    for (const id of decision.linkedAssumptionIds) {
      if (existsIn(assumptionIds, decision.projectId, id)) continue
      issues.push({
        kind: 'broken-link',
        table: 'decisions',
        entityId: decision.id,
        projectId: decision.projectId,
        label: decision.statement,
        detail: { field: 'linkedAssumptionIds', refId: id },
      })
    }
    for (const id of decision.linkedExperimentIds) {
      if (existsIn(experimentIds, decision.projectId, id)) continue
      issues.push({
        kind: 'broken-link',
        table: 'decisions',
        entityId: decision.id,
        projectId: decision.projectId,
        label: decision.statement,
        detail: { field: 'linkedExperimentIds', refId: id },
      })
    }
  }

  // Only nodes whose whole chain resolves can form a cycle; dangling parents
  // are reported as broken-link above and would otherwise look like a loop.
  const resolvable = ostNodes.filter((node) => node.parentId === null || ostIdsByProject.get(node.projectId)?.has(node.parentId))
  for (const id of findCycleRepresentatives(resolvable)) {
    const node = resolvable.find((n) => n.id === id)
    if (!node) continue
    issues.push({
      kind: 'cycle',
      table: 'ost_nodes',
      entityId: node.id,
      projectId: node.projectId,
      label: node.title,
      detail: { parentId: node.parentId },
    })
  }

  const capsByTable: Record<Exclude<HealthTable, 'ost_nodes'>, number> = {
    assumptions: CAPS.assumptions,
    experiments: CAPS.experiments,
    reports: CAPS.reports,
    decisions: CAPS.decisions,
  }
  for (const project of projects) {
    for (const table of ['assumptions', 'experiments', 'reports', 'decisions'] as const) {
      const count = rowsByTable[table].filter((row) => row.projectId === project.id).length
      if (count <= capsByTable[table]) continue
      issues.push({
        kind: 'over-capacity',
        table,
        entityId: project.id,
        projectId: project.id,
        label: projectNames.get(project.id) ?? project.id,
        detail: { count, limit: capsByTable[table], projectName: project.name },
      })
    }
    const nodeCount = ostNodes.filter((node) => node.projectId === project.id).length
    if (nodeCount > CAPS.ostNodes) {
      issues.push({
        kind: 'over-capacity',
        table: 'ost_nodes',
        entityId: project.id,
        projectId: project.id,
        label: project.name,
        detail: { count: nodeCount, limit: CAPS.ostNodes, projectName: project.name },
      })
    }
  }

  return {
    scannedAt: nowIso(),
    issues,
    counts: {
      projects: projects.length,
      assumptions: assumptions.length,
      experiments: experiments.length,
      ostNodes: ostNodes.length,
      reports: reports.length,
      decisions: decisions.length,
    },
  }
}

/** One issue, one transaction. over-capacity is report-only by design. */
export async function repairHealthIssue(issue: HealthIssue): Promise<void> {
  switch (issue.kind) {
    case 'orphan':
      await db.transaction('rw', db.table(issue.table), async () => {
        await db.table(issue.table).delete(issue.entityId)
      })
      return

    case 'cycle':
      await db.transaction('rw', db.ost_nodes, async () => {
        const raw = await db.ost_nodes.get(issue.entityId)
        if (!raw) throw new DomainError('NOT_FOUND', `OST 节点不存在: ${issue.entityId}`)
        const row = ostNodeSchema.parse({ ...raw, parentId: null, updatedAt: nowIso() })
        await db.ost_nodes.put(row)
      })
      return

    case 'broken-link': {
      const field = issue.detail?.field
      if (!field) throw new DomainError('INVALID_INPUT', '断链问题缺少引用字段')
      if (issue.table === 'experiments' && field === 'assumptionId') {
        await db.transaction('rw', db.experiments, async () => {
          const raw = await db.experiments.get(issue.entityId)
          if (!raw) throw new DomainError('NOT_FOUND', `实验不存在: ${issue.entityId}`)
          const row = experimentSchema.parse({ ...raw, assumptionId: null, updatedAt: nowIso() })
          await db.experiments.put(row)
        })
        return
      }
      if (issue.table === 'ost_nodes') {
        await db.transaction('rw', db.ost_nodes, async () => {
          const raw = await db.ost_nodes.get(issue.entityId)
          if (!raw) throw new DomainError('NOT_FOUND', `OST 节点不存在: ${issue.entityId}`)
          const patch =
            field === 'parentId'
              ? { parentId: null }
              : field === 'linkedAssumptionId'
                ? { linkedAssumptionId: null }
                : { linkedExperimentId: null }
          const row = ostNodeSchema.parse({ ...raw, ...patch, updatedAt: nowIso() })
          await db.ost_nodes.put(row)
        })
        return
      }
      if (issue.table === 'decisions') {
        const refId = issue.detail?.refId
        if (!refId) throw new DomainError('INVALID_INPUT', '断链问题缺少引用 id')
        await db.transaction('rw', db.decisions, async () => {
          const raw = await db.decisions.get(issue.entityId)
          if (!raw) throw new DomainError('NOT_FOUND', `决策不存在: ${issue.entityId}`)
          const patch =
            field === 'linkedAssumptionIds'
              ? { linkedAssumptionIds: raw.linkedAssumptionIds.filter((id) => id !== refId) }
              : { linkedExperimentIds: raw.linkedExperimentIds.filter((id) => id !== refId) }
          const row = decisionSchema.parse({ ...raw, ...patch, updatedAt: nowIso() })
          await db.decisions.put(row)
        })
        return
      }
      throw new DomainError('INVALID_INPUT', '该断链类型暂不支持修复')
    }

    case 'over-capacity':
      throw new DomainError('INVALID_INPUT', '超出容量只能手动清理，工具不会代删数据')

    default:
      throw new DomainError('INVALID_INPUT', '未知的问题类型')
  }
}
