import { useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { Assumption, Experiment, OstNode } from '@/schemas/entities'
import { NODE_HEIGHT, NODE_WIDTH, visibleNodes, type VisibleRect } from './ost-meta'
import { useT } from '@/lib/i18n'
import { OstNodeCard } from './OstNodeCard'

const CANVAS_WIDTH = 2400
const CANVAS_HEIGHT = 1400
const CULL_THRESHOLD = 150
const CULL_BUFFER = 200
const MIN_ZOOM = 0.4
const MAX_ZOOM = 2

interface OstCanvasProps {
  nodes: OstNode[]
  assumptions: Assumption[]
  experiments: Experiment[]
  cuttingId: string | null
  onCut: (id: string) => void
  onPasteInto: (id: string) => void
  onEdit: (node: OstNode) => void
  onDelete: (node: OstNode) => void
  onPosition: (id: string, x: number, y: number) => void
}

/** 视口在「逻辑画布坐标系」下的矩形——缩放后视口覆盖的逻辑区域按 1/zoom 换算。 */
interface ContainerRect extends VisibleRect {
  scrollLeft: number
  scrollTop: number
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 10) / 10))
}

/**
 * OST 画布：2400×1400 自由布局 + SVG 父子连线。缩放：按钮 / ctrl+滚轮 /
 * 双指捏合（移动端）。§5.4 节点超过 150 时启用视口裁剪（可见区 ±200 逻辑
 * 像素）。拖拽在 onDragEnd 一次性持久化 position（delta 按 zoom 归一）。
 */
export function OstCanvas({
  nodes,
  assumptions,
  experiments,
  cuttingId,
  onCut,
  onPasteInto,
  onEdit,
  onDelete,
  onPosition,
}: OstCanvasProps) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [rect, setRect] = useState<ContainerRect | null>(null)
  const [zoom, setZoom] = useState(1)
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setRect({
      x: el.scrollLeft / zoom - CULL_BUFFER,
      y: el.scrollTop / zoom - CULL_BUFFER,
      width: el.clientWidth / zoom + CULL_BUFFER * 2,
      height: el.clientHeight / zoom + CULL_BUFFER * 2,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    })
  }, [zoom])

  // 双指捏合缩放（非 passive 监听才能 preventDefault 阻断页面手势）。
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        const [a, b] = [event.touches[0]!, event.touches[1]!]
        pinchRef.current = {
          startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startZoom: zoom,
        }
      }
    }
    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current
      if (event.touches.length === 2 && pinch) {
        event.preventDefault()
        const [a, b] = [event.touches[0]!, event.touches[1]!]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        setZoom(clampZoom(pinch.startZoom * (dist / pinch.startDist)))
      }
    }
    const onTouchEnd = () => {
      pinchRef.current = null
    }
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom((z) => clampZoom(event.deltaY < 0 ? z + 0.1 : z - 0.1))
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [zoom])

  const culling = nodes.length > CULL_THRESHOLD
  const visibleIds = useMemo(() => {
    if (!culling || !rect) return null
    return visibleNodes(nodes, rect)
  }, [culling, rect, nodes])

  const assumptionById = useMemo(() => new Map(assumptions.map((a) => [a.id, a])), [assumptions])
  const experimentById = useMemo(() => new Map(experiments.map((e) => [e.id, e])), [experiments])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  function handleDragEnd(event: DragEndEvent) {
    const start = (event.active.data.current?.position ?? { x: 0, y: 0 }) as OstNode['position']
    onPosition(
      String(event.active.id),
      Math.max(0, start.x + event.delta.x / zoom),
      Math.max(0, start.y + event.delta.y / zoom),
    )
  }

  function handleScroll() {
    const el = containerRef.current
    if (el && culling) {
      setRect({
        x: el.scrollLeft / zoom - CULL_BUFFER,
        y: el.scrollTop / zoom - CULL_BUFFER,
        width: el.clientWidth / zoom + CULL_BUFFER * 2,
        height: el.clientHeight / zoom + CULL_BUFFER * 2,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      })
    }
  }

  const edges = nodes
    .filter((n) => n.parentId && nodeById.has(n.parentId))
    .filter((n) => !visibleIds || (visibleIds.has(n.id) && visibleIds.has(n.parentId!)))
  const rendered = visibleIds ? nodes.filter((n) => visibleIds.has(n.id)) : nodes

  return (
    <div className="relative">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[min(72dvh,640px)] overflow-auto rounded-lg border border-hairline bg-surface-2"
          aria-label={t('ost.canvasAria')}
        >
          <div style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
            <div
              className="relative origin-top-left"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                transform: `scale(${zoom})`,
                backgroundImage:
                  'radial-gradient(circle, var(--color-hairline-strong) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            >
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
              >
                {edges.map((node) => {
                  const parent = nodeById.get(node.parentId!)!
                  const px = parent.position.x + NODE_WIDTH / 2
                  const py = parent.position.y + NODE_HEIGHT
                  const cx = node.position.x + NODE_WIDTH / 2
                  const cy = node.position.y
                  return (
                    <path
                      key={node.id}
                      d={`M ${px} ${py} C ${px} ${py + 44}, ${cx} ${cy - 44}, ${cx} ${cy}`}
                      className="stroke-accent"
                      strokeWidth={1.5}
                      fill="none"
                      opacity={0.35}
                    />
                  )
                })}
              </svg>
              {rendered.map((node) => (
                <OstNodeCard
                  key={node.id}
                  node={node}
                  zoom={zoom}
                  assumption={node.linkedAssumptionId ? (assumptionById.get(node.linkedAssumptionId) ?? null) : null}
                  experiment={node.linkedExperimentId ? (experimentById.get(node.linkedExperimentId) ?? null) : null}
                  cutting={cuttingId === node.id}
                  onCut={onCut}
                  onPasteInto={onPasteInto}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onPosition={onPosition}
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>

      <div
        className="absolute bottom-3 right-3 flex items-center gap-1 rounded-btn border border-hairline bg-surface-1/95 p-1 shadow-card backdrop-blur"
        role="group"
        aria-label={t('ost.zoomAria')}
      >
        <button
          type="button"
          aria-label={t('ost.zoomOut')}
          onClick={() => setZoom((z) => clampZoom(z - 0.1))}
          className="flex size-9 items-center justify-center rounded-btn text-body text-ink-secondary hover:bg-surface-2 hover:text-ink"
        >
          −
        </button>
        <span className="min-w-12 text-center text-caption text-ink-muted">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label={t('ost.zoomIn')}
          onClick={() => setZoom((z) => clampZoom(z + 0.1))}
          className="flex size-9 items-center justify-center rounded-btn text-body text-ink-secondary hover:bg-surface-2 hover:text-ink"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="min-h-9 rounded-btn px-2 text-caption text-ink-faint hover:text-ink"
        >
          {t('ost.reset')}
        </button>
      </div>
    </div>
  )
}
