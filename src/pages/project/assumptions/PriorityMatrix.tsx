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
  const point = active ? payload?.[0]?.payload : undefined
  if (!point) return null
  const a = point.assumption
  return (
    <div className="max-w-72 rounded-md border border-hairline-strong bg-surface-3 px-3 py-2 text-caption text-ink-secondary shadow-lg">
      <p className="text-ink">{a.statement}</p>
      <p className="mt-1 text-ink-muted">
        {ASSUMPTION_TYPE_META[a.type].label} · 影响 {a.impact} · 风险 {a.risk} · 信心{' '}
        {a.confidence === null ? '未评估' : `${Math.round(a.confidence * 100)}%`} · 优先分{' '}
        {a.priorityScore.toFixed(2)}
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
  const points = useMemo<MatrixPoint[]>(
    () => items.map((a) => ({ x: a.impact, y: a.risk, z: 1 - (a.confidence ?? 0), assumption: a })),
    [items],
  )

  return (
    <div
      className="relative"
      role="img"
      aria-label={`优先级矩阵：共 ${points.length} 条假设。横轴为影响（1–5），纵轴为风险（1–5），圆点越大表示证据越少。表格视图提供等价数据。`}
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
        {QUADRANT_META.reject.label}
      </span>
      <span className="pointer-events-none absolute right-4 top-1 text-caption text-ink-faint">
        {QUADRANT_META.experiment.label}
      </span>
      <span className="pointer-events-none absolute bottom-12 left-10 text-caption text-ink-faint">
        {QUADRANT_META.defer.label}
      </span>
      <span className="pointer-events-none absolute bottom-12 right-4 text-caption text-ink-faint">
        {QUADRANT_META.implement.label}
      </span>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-faint">
        <span>横轴 影响 · 纵轴 风险 · 圆点面积 = 证据缺口（越大越缺证据）</span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-accent" />
          待验证/验证中
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-success" />
          已验证
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block size-2.5 rounded-full bg-danger" />
          已证伪
        </span>
      </p>
    </div>
  )
}

/** §8.5: the table is the matrix's screen-reader-equivalent view. */
export function MatrixTable({ items }: { items: Assumption[] }) {
  if (items.length === 0) {
    return <p className="text-body-sm text-ink-faint">暂无可展示的假设。</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-body-sm">
        <caption className="mb-2 text-left text-caption text-ink-muted">
          Priority Matrix 表格等价视图（按优先分降序）
        </caption>
        <thead>
          <tr className="border-b border-hairline text-left text-caption text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              假设
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              类别
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              影响
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              风险
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              信心
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              优先分
            </th>
            <th scope="col" className="py-2 font-medium">
              状态
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id} className="border-b border-hairline/60 align-top">
              <td className="max-w-72 py-2 pr-3 text-ink">{a.statement}</td>
              <td className="py-2 pr-3">
                <span className={`rounded-full px-2 py-0.5 text-caption ${ASSUMPTION_TYPE_META[a.type].badgeClass}`}>
                  {ASSUMPTION_TYPE_META[a.type].label}
                </span>
              </td>
              <td className="py-2 pr-3 text-ink-secondary">{a.impact}</td>
              <td className="py-2 pr-3 text-ink-secondary">{a.risk}</td>
              <td className="py-2 pr-3 text-ink-secondary">
                {a.confidence === null ? '未评估' : `${Math.round(a.confidence * 100)}%`}
              </td>
              <td className="py-2 pr-3 text-ink">{a.priorityScore.toFixed(2)}</td>
              <td className="py-2">
                <span className={`rounded-full px-2 py-0.5 text-caption ${STATUS_META[a.status].badgeClass}`}>
                  {STATUS_META[a.status].label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
