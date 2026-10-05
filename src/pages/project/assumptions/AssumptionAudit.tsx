import { useLiveQuery } from 'dexie-react-hooks'
import { scoreEventsRepo } from '@/db/repositories'

function formatSnapshot(s: { impact: number; risk: number; confidence: number | null; priorityScore: number }) {
  return `影响 ${s.impact} · 风险 ${s.risk} · 信心 ${
    s.confidence === null ? '未评估' : `${Math.round(s.confidence * 100)}%`
  } · 优先分 ${s.priorityScore.toFixed(2)}`
}

/** §5.2 audit trail: changedBy / changedAt / before→after, newest first. */
export function AssumptionAudit({ assumptionId }: { assumptionId: string }) {
  const events = useLiveQuery(() => scoreEventsRepo.byAssumption(assumptionId), [assumptionId])

  if (!events) return <p className="text-caption text-ink-faint">加载评分历史…</p>
  if (events.length === 0) return <p className="text-caption text-ink-faint">暂无评分记录。</p>

  const sorted = [...events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
  return (
    <ol className="space-y-2" aria-label="评分历史">
      {sorted.map((event) => (
        <li
          key={event.seq ?? `${event.assumptionId}-${event.changedAt}`}
          className="rounded-md border border-hairline bg-surface-2 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-caption ${
                event.changedBy === 'ai-suggestion'
                  ? 'border border-accent/40 bg-accent/15 text-accent-hover'
                  : 'border border-hairline bg-surface-3 text-ink-muted'
              }`}
            >
              {event.changedBy === 'ai-suggestion' ? 'AI 建议' : '用户'}
            </span>
            <span className="text-caption text-ink-faint">{event.changedAt.replace('T', ' ').slice(0, 16)}</span>
          </div>
          <p className="mt-1 text-caption text-ink-secondary">
            {event.before === null ? (
              <>创建：{formatSnapshot(event.after)}</>
            ) : (
              <>
                {formatSnapshot(event.before)} <span aria-hidden>→</span> {formatSnapshot(event.after)}
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  )
}
