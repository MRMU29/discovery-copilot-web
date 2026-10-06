import { useDraggable } from '@dnd-kit/core'
import { BlocksIcon, FlaskIcon, MessageIcon, TargetIcon } from '@/components/ui/icons'
import type { Assumption, Experiment, OstNode } from '@/schemas/entities'
import { NODE_HEIGHT, NODE_WIDTH, OST_TYPE_META, type OstNodeType } from './ost-meta'
import { useT } from '@/lib/i18n'

const TYPE_ICONS: Record<OstNodeType, typeof TargetIcon> = {
  outcome: TargetIcon,
  opportunity: MessageIcon,
  solution: BlocksIcon,
  experiment: FlaskIcon,
}

interface OstNodeCardProps {
  node: OstNode
  /** 画布缩放系数：拖拽视觉位移按 1/zoom 归一，保证跟手且提交一致。 */
  zoom: number
  assumption: Assumption | null
  experiment: Experiment | null
  /** 剪切态（键盘换父：X 剪切 → 选目标 → V 粘贴）。 */
  cutting: boolean
  /** 键盘等价操作回调；position 更新也走这里（方向键步进）。 */
  onCut: (id: string) => void
  onPasteInto: (id: string) => void
  onEdit: (node: OstNode) => void
  onDelete: (node: OstNode) => void
  onPosition: (id: string, x: number, y: number) => void
}

/**
 * OST 节点卡：自由拖拽（PointerSensor, distance 6 防误触）+ 完整键盘等价
 * （Tab 聚焦 → 方向键微调位置 / X 剪切 / V 粘贴换父 / Enter 编辑）。
 * touch-action 仅设在卡片上，画布其余区域保留原生滚动。
 */
export function OstNodeCard({
  node,
  zoom,
  assumption,
  experiment,
  cutting,
  onCut,
  onPasteInto,
  onEdit,
  onDelete,
  onPosition,
}: OstNodeCardProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { position: node.position },
  })
  const meta = OST_TYPE_META[node.type]
  const TypeIcon = TYPE_ICONS[node.type]

  const x = node.position.x + (transform?.x ?? 0) / zoom
  const y = node.position.y + (transform?.y ?? 0) / zoom

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.target !== event.currentTarget) return
    const STEP = 20
    switch (event.key) {
      case 'ArrowLeft':
        onPosition(node.id, Math.max(0, node.position.x - STEP), node.position.y)
        break
      case 'ArrowRight':
        onPosition(node.id, node.position.x + STEP, node.position.y)
        break
      case 'ArrowUp':
        onPosition(node.id, node.position.x, Math.max(0, node.position.y - STEP))
        break
      case 'ArrowDown':
        onPosition(node.id, node.position.x, node.position.y + STEP)
        break
      case 'x':
      case 'X':
        onCut(node.id)
        break
      case 'v':
      case 'V':
        onPasteInto(node.id)
        break
      case 'Enter':
        onEdit(node)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={t('ost.nodeAria', { type: t(meta.labelKey), title: node.title })}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, touchAction: 'none' }}
      className={`absolute rounded-lg border bg-surface-1 p-2.5 shadow-card transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        cutting ? 'border-dashed border-accent ring-1 ring-accent' : 'border-hairline'
      } ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span
          {...listeners}
          {...attributes}
          aria-label={t('ost.dragAria', { title: node.title })}
          className="flex cursor-grab touch-none items-center gap-1 rounded-full px-1.5 py-0.5 text-caption active:cursor-grabbing"
        >
          <TypeIcon size={12} />
          <span className={`rounded-full px-1.5 py-0.5 text-caption ${meta.badgeClass}`}>{t(meta.labelKey)}</span>
        </span>
        <span className="ml-auto text-caption text-ink-faint" aria-hidden>
          ⠿
        </span>
      </div>

      <p className="mt-1.5 text-body-sm font-medium leading-snug text-ink">{node.title}</p>

      {(assumption || experiment) && (
        <div className="mt-1.5 space-y-0.5 text-caption text-ink-faint">
          {assumption && <p title={assumption.statement}>⇄ {assumption.statement.slice(0, 18)}…</p>}
          {experiment && <p title={experiment.hypothesis}>⚗ {experiment.hypothesis.slice(0, 18)}…</p>}
        </div>
      )}

      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => onEdit(node)}
          className="min-h-7 rounded-btn px-1.5 text-caption text-ink-secondary hover:bg-surface-2 hover:text-ink"
        >
          {t('common.edit')}
        </button>
        <button
          type="button"
          onClick={() => onCut(node.id)}
          aria-pressed={cutting}
          className="min-h-7 rounded-btn px-1.5 text-caption text-ink-secondary hover:bg-surface-2 hover:text-ink"
        >
          {cutting ? t('ost.cutting') : t('ost.reparent')}
        </button>
        <button
          type="button"
          onClick={() => onDelete(node)}
          className="ml-auto min-h-7 rounded-btn px-1.5 text-caption text-danger hover:bg-danger/10"
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  )
}
