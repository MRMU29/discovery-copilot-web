import { useMemo } from 'react'
import {
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ASSUMPTION_TYPE_META, QUADRANT_META, STATUS_META } from '@/lib/assumption-meta'
import type { Assumption } from '@/schemas/entities'
import { useT } from '@/lib/i18n'

interface MatrixPoint {
  x: number
  y: number
  /** Confidence complement — drives dot size (null confidence = 1 = largest). */
  z: number
  assumption: Assumption
}

const STATUS_COLOR: Record<Assumption['status'], string> = {
  open: 'var(--color-accent)',
  testing: 'var(--color-accent)',
  validated: 'var(--color-success)',
  invalidated: 'var(--color-danger)',
  archived: 'var(--color-ink-faint)',
}

/** Area grows with the complement (§5.2): r = 4 + 12·√z keeps dots visible at z=0. */
function dotRadius(z: number): number {
  return 4 + 12 * Math.sqrt(Math.min(1, Math.max(0, z)))
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: MatrixPoint
  onSelect?: (id: string) => void
}

function StatusDot({ cx, cy, payload, onSelect }: DotProps) {
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return <g />
  return (
    <circle
      cx={cx}
      cy={cy}
      r={dotRadius(payload.z)}
      fill={STATUS_COLOR[payload.assumption.status]}
      fillOpacity={0.8}
      stroke="var(--color-canvas)"
      strokeWidth={1}
      className="cursor-pointer"
      onClick={() => onSelect?.(payload.assumption.id)}
    />
  )
}

interface TooltipItem {
  payload?: MatrixPoint
}

function MatrixTooltip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  const t = useT()
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  const a = point.assumption
  return (
    <div className="max-w-72 rounded-md border border-hairline-strong bg-surface-3 px-3 py-2 text-caption text-ink-secondary shadow-lg">
      <p className="text-ink">{a.statement}</p>
      <p className="mt-1 text-ink-muted">
        {t('matrix.tooltip', {
          type: t(ASSUMPTION_TYPE_META[a.type].labelKey),
          impact: a.impact,
          risk: a.risk,
          confidence: a.confidence === null ? t('assumption.unassessed') : `${Math.round(a.confidence * 100)}%`,
          score: a.priorityScore.toFixed(2),
        })}
      </p>
    </div>
  )
}

const AXIS_TICK = { fill: 'var(--color-ink-muted)', fontSize: 12 }

/**
 * Four-quadrant Priority Matrix (§5.2): X = Impact, Y = Risk, split at 3.5;
 * dot area maps the confidence complement. Quadrant corners carry the
 * prioritize-assumptions actions in Chinese.
 */
export function PriorityMatrix({
  items,
  onSelectPoint,
}: {
  items: Assumption[]
  onSelectPoint?: (id: string) => void
}) {
  const t = useT()
  const points = useMemo<MatrixPoint[]>(
    () => items.map((a) => ({ x: a.impact, y: a.risk, z: 1 - (a.confidence ?? 0), assumption: a })),
    [items],
  )

  return (
    <div
      className="relative"
      role="img"
      aria-label={t('matrix.aria', { count: points.length })}
    >
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 24, right: 16, bottom: 8, left: 0 }}>
          <XAxis
            type="number"
            dataKey="x"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--color-hairline-strong)' }}
            tickMargin={8}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            width={28}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine x={3.5} stroke="var(--color-hairline-strong)" strokeDasharray="4 4" />
          <ReferenceLine y={3.5} stroke="var(--color-hairline-strong)" strokeDasharray="4 4" />
          <Tooltip
            content={<MatrixTooltip />}
            cursor={{ stroke: 'var(--color-hairline-tertiary)', strokeDasharray: '4 4' }}
          />
          <Scatter data={points} shape={<StatusDot onSelect={onSelectPoint} />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>

      <span className="pointer-events-none absolute left-10 top-1 text-caption text-ink-faint">
        {t(QUADRANT_META.reject.labelKey)}
      </span>
      <span className="pointer-events-none absolute right-4 top-1 text-caption text-ink-faint">
        {t(QUADRANT_META.experiment.labelKey)}
      </span>
      <span className="pointer-events-none absolute bottom-12 left-10 text-caption text-ink-faint">
        {t(QUADRANT_META.defer.labelKey)}
      </span>
      <span className="pointer-events-none absolute bottom-12 right-4 text-caption text-ink-faint">
        {t(QUADRANT_META.implement.labelKey)}
      </span>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-faint">
        <span>{t('matrix.axisHint')}</span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-accent" />
          {t('matrix.legendOpen')}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-success" />
          {t('matrix.legendValidated')}
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-danger" />
          {t('matrix.legendInvalidated')}
        </span>
      </p>
    </div>
  )
}

/** §8.5: the table is the matrix's screen-reader-equivalent view. */
export function MatrixTable({ items }: { items: Assumption[] }) {
  const t = useT()
  if (items.length === 0) {
    return <p className="text-body-sm text-ink-faint">{t('matrix.tableEmpty')}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-body-sm">
        <caption className="mb-2 text-left text-caption text-ink-muted">{t('matrix.tableCaption')}</caption>
        <thead>
          <tr className="border-b border-hairline text-left text-caption text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.statement')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.type')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.impact')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.risk')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.confidence')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('matrix.th.score')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('matrix.th.status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-hairline/60 align-top">
              <td className="max-w-72 py-2 pr-3 text-ink">{a.statement}</td>
              <td className="py-2 pr-3">
                <span className={`rounded-full px-2 py-0.5 text-caption ${ASSUMPTION_TYPE_META[a.type].badgeClass}`}>
                  {t(ASSUMPTION_TYPE_META[a.type].labelKey)}
                </span>
              </td>
              <td className="py-2 pr-3 text-ink-secondary">{a.impact}</td>
              <td className="py-2 pr-3 text-ink-secondary">{a.risk}</td>
              <td className="py-2 pr-3 text-ink-secondary">
                {a.confidence === null ? t('assumption.unassessed') : `${Math.round(a.confidence * 100)}%`}
              </td>
              <td className="py-2 pr-3 text-ink">{a.priorityScore.toFixed(2)}</td>
              <td className="py-2">
                <span className={`rounded-full px-2 py-0.5 text-caption ${STATUS_META[a.status].badgeClass}`}>
                  {t(STATUS_META[a.status].labelKey)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
