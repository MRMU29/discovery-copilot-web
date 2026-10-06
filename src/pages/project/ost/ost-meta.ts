import type { Assumption, Experiment, OstNode } from '@/schemas/entities'
import { translate } from '@/lib/i18n'

export type OstNodeType = OstNode['type']

/** OstCanvas 节点盒尺寸（连线锚点与视口裁剪共用）。 */
export const NODE_WIDTH = 220
export const NODE_HEIGHT = 96

/**
 * §5.3 链规则（与服务层 REQUIRED_PARENT 同构，供 UI 过滤合法父下拉）：
 * outcome 为根；opportunity ← outcome；solution ← opportunity；experiment ← solution。
 */
export function requiredParentType(type: OstNodeType): OstNodeType | null {
  switch (type) {
    case 'opportunity':
      return 'outcome'
    case 'solution':
      return 'opportunity'
    case 'experiment':
      return 'solution'
    case 'outcome':
      return null
  }
}

export const OST_TYPE_META: Record<OstNodeType, { labelKey: string; badgeClass: string }> = {
  outcome: { labelKey: 'ost.type.outcome', badgeClass: 'bg-tint-purple text-surface-1' },
  opportunity: { labelKey: 'ost.type.opportunity', badgeClass: 'bg-tint-blue text-surface-1' },
  solution: { labelKey: 'ost.type.solution', badgeClass: 'bg-tint-green text-surface-1' },
  experiment: { labelKey: 'ost.type.experiment', badgeClass: 'bg-tint-orange text-surface-1' },
}

export interface VisibleRect {
  x: number
  y: number
  width: number
  height: number
}

/** §5.4：>150 节点时启用视口裁剪——按节点包围盒与可见矩形求交过滤。 */
export function visibleNodes(nodes: OstNode[], rect: VisibleRect): Set<string> {
  const visible = new Set<string>()
  for (const node of nodes) {
    const { x, y } = node.position
    if (
      x < rect.x + rect.width &&
      x + NODE_WIDTH > rect.x &&
      y < rect.y + rect.height &&
      y + NODE_HEIGHT > rect.y
    ) {
      visible.add(node.id)
    }
  }
  return visible
}

/** BFS 子孙集合（换父前排除自身子树，防 CYCLE 提示绕到服务层才报错）。 */
export function descendantIds(nodes: OstNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parentId) {
      const list = childrenOf.get(node.parentId) ?? []
      list.push(node.id)
      childrenOf.set(node.parentId, list)
    }
  }
  const doomed = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const child of childrenOf.get(current) ?? []) {
      doomed.add(child)
      queue.push(child)
    }
  }
  return doomed
}

export interface OstTableRow {
  id: string
  type: OstNodeType
  typeLabel: string
  title: string
  parentTitle: string
  assumptionTitle: string
  experimentTitle: string
  x: number
  y: number
}

/** 表格等价视图（§8.5）：与画布同数据的线性读法，供屏幕阅读器与快速检索。 */
export function ostTableRows(
  nodes: OstNode[],
  assumptions: Assumption[],
  experiments: Experiment[],
): OstTableRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const assumptionById = new Map(assumptions.map((a) => [a.id, a]))
  const experimentById = new Map(experiments.map((e) => [e.id, e]))
  return [...nodes]
    .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title))
    .map((node) => ({
      id: node.id,
      type: node.type,
      typeLabel: OST_TYPE_META[node.type].labelKey,
      title: node.title,
      parentTitle: node.parentId ? (byId.get(node.parentId)?.title ?? translate('ost.meta.missingParent')) : '—',
      assumptionTitle: node.linkedAssumptionId
        ? (assumptionById.get(node.linkedAssumptionId)?.statement ?? translate('ost.meta.missingAssumption'))
        : '—',
      experimentTitle: node.linkedExperimentId
        ? (experimentById.get(node.linkedExperimentId)?.hypothesis ?? translate('ost.meta.missingExperiment'))
        : '—',
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    }))
}
