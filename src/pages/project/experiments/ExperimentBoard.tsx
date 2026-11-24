import { useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { Assumption, Experiment } from '@/schemas/entities'
import { updateExperiment } from '@/services/experiments'
import { useT } from '@/lib/i18n'
import {
  BOARD_COLUMNS,
  EXPERIMENT_STATUS_META,
  groupByStatus,
  pendingResultCount,
  type ExperimentStatus,
} from './experiment-meta'
import { ExperimentCard } from './ExperimentCard'

interface ExperimentBoardProps {
  experiments: Experiment[]
  assumptions: Assumption[]
  assumptionById: Map<string, Assumption>
}

/**
 * Four-column board (§roadmap 4.1). Dragging is an accelerator, not the only
 * path: every card still carries the status `<select>` inside ExperimentCard,
 * so keyboard and touch users can move an experiment without a pointer drag.
 */
export function ExperimentBoard({ experiments, assumptions, assumptionById }: ExperimentBoardProps) {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const groups = groupByStatus(experiments)
  const pending = pendingResultCount(experiments)

  async function handleDragEnd(event: DragEndEvent) {
    const target = event.over?.id
    if (typeof target !== 'string') return
    const status = target as ExperimentStatus
    const experiment = experiments.find((e) => e.id === event.active.id)
    if (!experiment || experiment.status === status) return
    setError(null)
    try {
      await updateExperiment(experiment.id, { status })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
      {pending > 0 && (
        <p className="text-caption text-ink-muted">{t('experiments.board.pendingResultCount', { count: pending })}</p>
      )}
      <DndContext sensors={sensors} onDragEnd={(event) => void handleDragEnd(event)}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              count={groups[status].length}
              pending={status === 'completed' ? pending : 0}
            >
              {groups[status].map((experiment) => (
                <DraggableExperiment key={experiment.id} experiment={experiment}>
                  <ExperimentCard
                    experiment={experiment}
                    assumption={
                      experiment.assumptionId ? (assumptionById.get(experiment.assumptionId) ?? null) : null
                    }
                    assumptions={assumptions}
                  />
                </DraggableExperiment>
              ))}
            </BoardColumn>
          ))}
        </div>
      </DndContext>
    </div>
  )
}

function BoardColumn({
  status,
  count,
  pending,
  children,
}: {
  status: ExperimentStatus
  count: number
  pending: number
  children: ReactNode
}) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={t(EXPERIMENT_STATUS_META[status].labelKey)}
      className={`min-w-0 rounded-lg border bg-surface-2/40 p-2 transition-colors ${
        isOver ? 'border-accent bg-accent/5' : 'border-hairline'
      }`}
    >
      <h3 className="flex flex-wrap items-center gap-2 px-1 pb-2 text-eyebrow text-ink-muted">
        {t(EXPERIMENT_STATUS_META[status].labelKey)}
        <span className="rounded-full border border-hairline bg-surface-1 px-1.5 text-caption text-ink-faint">
          {count}
        </span>
        {pending > 0 && (
          <span className="rounded-full border border-warning/40 bg-tint-yellow px-1.5 text-caption text-ink">
            {t('experiments.board.pendingResultCount', { count: pending })}
          </span>
        )}
      </h3>
      <div className="space-y-3">{children}</div>
      {count === 0 && (
        <p className="px-1 py-3 text-caption text-ink-faint">{t('experiments.board.emptyColumn')}</p>
      )}
    </section>
  )
}

function DraggableExperiment({ experiment, children }: { experiment: Experiment; children: ReactNode }) {
  const t = useT()
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({ id: experiment.id })
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'relative z-10 opacity-60' : 'relative'}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label={t('experiments.board.dragHandle', { title: experiment.hypothesis })}
        className="mb-1 flex min-h-11 w-full cursor-grab touch-none items-center justify-center rounded-btn text-caption text-ink-faint hover:bg-surface-2 active:cursor-grabbing sm:min-h-8"
      >
        <span aria-hidden>⠿</span>
      </button>
      {children}
    </div>
  )
}
