import { useLiveQuery } from 'dexie-react-hooks'
import { scoreEventsRepo } from '@/db/repositories'
import { useT } from '@/lib/i18n'

function formatSnapshot(t: (key: string, params?: Record<string, string | number>) => string, s: { impact: number; risk: number; confidence: number | null; priorityScore: number }) {
  return t('audit.snapshot', {
    impact: s.impact,
    risk: s.risk,
    confidence: s.confidence === null ? t('assumption.unassessed') : `${Math.round(s.confidence * 100)}%`,
    score: s.priorityScore.toFixed(2),
  })
}

/** §5.2 audit trail: changedBy / changedAt / before→after, newest first. */
export function AssumptionAudit({ assumptionId }: { assumptionId: string }) {
  const t = useT()
  const events = useLiveQuery(() => scoreEventsRepo.byAssumption(assumptionId), [assumptionId])

  if (!events) return <p className="text-caption text-ink-faint">{t('audit.loading')}</p>
  if (events.length === 0) return <p className="text-caption text-ink-faint">{t('audit.empty')}</p>

  const sorted = [...events].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
  return (
    <ol className="space-y-2" aria-label={t('assumption.history')}>
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
              {event.changedBy === 'ai-suggestion' ? t('audit.aiSuggestion') : t('audit.user')}
            </span>
            <span className="text-caption text-ink-faint">{event.changedAt.replace('T', ' ').slice(0, 16)}</span>
          </div>
          <p className="mt-1 text-caption text-ink-secondary">
            {event.before === null ? (
              <>{t('audit.created', { snapshot: formatSnapshot(t, event.after) })}</>
            ) : (
              <>
                {formatSnapshot(t, event.before)} <span aria-hidden>→</span> {formatSnapshot(t, event.after)}
              </>
            )}
          </p>
        </li>
      ))}
    </ol>
  )
}
