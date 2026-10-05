import type { z } from 'zod'
import { db } from '@/db/db'
import { assumptionsRepo, experimentsRepo, ostRepo, projectsRepo } from '@/db/repositories'
import { nowIso } from '@/lib/clock'
import { DomainError } from '@/lib/errors'
import { CAPS } from '@/lib/limits'
import { OST_NODE_TYPES, ostNodeSchema, type OstNode } from '@/schemas/entities'

type OstNodeInput = Omit<z.input<typeof ostNodeSchema>, 'id' | 'projectId' | 'createdAt'>
type OstMovePatch = Partial<
  Pick<z.input<typeof ostNodeSchema>, 'parentId' | 'position' | 'title' | 'linkedAssumptionId' | 'linkedExperimentId'>
>

export type OstNodeType = (typeof OST_NODE_TYPES)[number]

/** §5.3 chain: outcome ← opportunity ← solution ← experiment. Roots are outcome-only. */
const REQUIRED_PARENT: Record<Exclude<OstNodeType, 'outcome'>, OstNodeType> = {
  opportunity: 'outcome',
  solution: 'opportunity',
  experiment: 'solution',
}

function normalize(row: OstNode): OstNode {
  try {
    return ostNodeSchema.parse(row)
  } catch {
    throw new DomainError('CORRUPT_ROW', `OST 节点数据损坏且无法规范化: ${row?.id ?? '(unknown id)'}`)
  }
}

async function assertLinkedRefs(
  projectId: string,
  linkedAssumptionId: string | null | undefined,
  linkedExperimentId: string | null | undefined,
): Promise<void> {
  if (linkedAssumptionId) {
    const a = await assumptionsRepo.get(linkedAssumptionId)
    if (!a || a.projectId !== projectId) {
      throw new DomainError('INTEGRITY', `关联假设不存在或不属于本项目: ${linkedAssumptionId}`)
    }
  }
  if (linkedExperimentId) {
    const e = await experimentsRepo.get(linkedExperimentId)
    if (!e || e.projectId !== projectId) {
      throw new DomainError('INTEGRITY', `关联实验不存在或不属于本项目: ${linkedExperimentId}`)
    }
  }
}

async function assertParentRule(
  projectId: string,
  type: OstNodeType,
  parentId: string | null,
): Promise<void> {
  if (type === 'outcome') {
    if (parentId != null) throw new DomainError('PARENT_RULE', 'outcome 是根节点，不能有父节点')
    return
  }
  if (!parentId) throw new DomainError('PARENT_RULE', `${type} 节点必须有父节点`)
  const parent = await ostRepo.get(parentId)
  if (!parent) throw new DomainError('NOT_FOUND', `父节点不存在: ${parentId}`)
  if (parent.projectId !== projectId) {
    throw new DomainError('INTEGRITY', 'OST 节点必须与父节点同项目')
  }
  if (parent.type !== REQUIRED_PARENT[type]) {
    throw new DomainError('PARENT_RULE', `${type} 的父节点必须是 ${REQUIRED_PARENT[type]}`)
  }
}

export async function createOstNode(projectId: string, input: OstNodeInput): Promise<OstNode> {
  return db.transaction(
    'rw',
    [db.projects, db.assumptions, db.experiments, db.ost_nodes],
    async () => {
      const project = await projectsRepo.get(projectId)
      if (!project || project.deletedAt) {
        throw new DomainError('NOT_FOUND', `项目不存在或已在回收站: ${projectId}`)
      }
      const count = await ostRepo.countByProject(projectId)
      if (count >= CAPS.ostNodes) {
        throw new DomainError('CAPACITY_LIMIT', `单项目 OST 节点数已达上限 ${CAPS.ostNodes}`)
      }
      await assertParentRule(projectId, input.type, input.parentId ?? null)
      await assertLinkedRefs(projectId, input.linkedAssumptionId, input.linkedExperimentId)
      const row = ostNodeSchema.parse({
        ...input,
        id: crypto.randomUUID(),
        projectId,
        createdAt: nowIso(),
      })
      await ostRepo.put(row)
      return row
    },
  )
}

/** Move/rename/re-link one node — the single write path for existing nodes. */
export async function moveOstNode(id: string, patch: OstMovePatch): Promise<OstNode> {
  return db.transaction('rw', [db.ost_nodes], async () => {
    const raw = await ostRepo.get(id)
    if (!raw) throw new DomainError('NOT_FOUND', `OST 节点不存在: ${id}`)
    const current = normalize(raw)
    if (patch.parentId !== undefined && patch.parentId !== current.parentId) {
      await assertParentRule(current.projectId, current.type, patch.parentId)
      // Cycle guard: walk the candidate ancestor chain; reaching self would close a loop.
      let cursor = patch.parentId
      while (cursor != null) {
        if (cursor === id) throw new DomainError('CYCLE', '不能把节点移动到它自己的子孙节点下')
        const ancestor = await ostRepo.get(cursor)
        if (!ancestor) throw new DomainError('NOT_FOUND', `父节点不存在: ${cursor}`)
        cursor = ancestor.parentId
      }
    }
    if (
      patch.linkedAssumptionId !== undefined ||
      patch.linkedExperimentId !== undefined
    ) {
      await assertLinkedRefs(current.projectId, patch.linkedAssumptionId, patch.linkedExperimentId)
    }
    const row = ostNodeSchema.parse({ ...current, ...patch })
    await ostRepo.put(row)
    return row
  })
}

/** Subtree cascade delete (children reparenting is a command-7 UI concern). */
export async function deleteOstNode(id: string): Promise<number> {
  return db.transaction('rw', [db.ost_nodes], async () => {
    const root = await ostRepo.get(id)
    if (!root) throw new DomainError('NOT_FOUND', `OST 节点不存在: ${id}`)
    const doomed: string[] = [id]
    const queue: OstNode[] = [ostNodeSchema.parse(root)]
    while (queue.length > 0) {
      const node = queue.pop()!
      const children = await ostRepo.childrenOf(node.projectId, node.id)
      for (const child of children) {
        doomed.push(child.id)
        queue.push(child)
      }
    }
    await ostRepo.delete(doomed)
    return doomed.length
  })
}

export async function getOstNode(id: string): Promise<OstNode> {
  const raw = await ostRepo.get(id)
  if (!raw) throw new DomainError('NOT_FOUND', `OST 节点不存在: ${id}`)
  return normalize(raw)
}

export async function listOstNodesByProject(projectId: string): Promise<OstNode[]> {
  const rows = await ostRepo.byProject(projectId)
  return rows.map(normalize)
}
