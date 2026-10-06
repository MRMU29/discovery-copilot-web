import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ASSUMPTION_TYPE_META, STATUS_META, type AssumptionStatus } from '@/lib/assumption-meta'
import type { Assumption } from '@/schemas/entities'
import { useT } from '@/lib/i18n'
import { deleteAssumption, updateAssumption } from '@/services/assumptions'
import { AssumptionAudit } from './AssumptionAudit'
import { AssumptionForm } from './AssumptionForm'

type Pane = 'none' | 'edit' | 'audit'

const STATUS_OPTIONS = Object.entries(STATUS_META)

export function AssumptionCard({
  assumption,
  highlighted,
}: {
  assumption: Assumption
  highlighted: boolean
}) {
  const t = useT()
  const [pane, setPane] = useState<Pane>('none')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typeMeta = ASSUMPTION_TYPE_META[assumption.type]
  const statusMeta = STATUS_META[assumption.status]

  async function handleStatus(status: AssumptionStatus) {
    setError(null)
    try {
      await updateAssumption(assumption.id, { status }, { changedBy: 'user' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('assumption.deleteConfirm'))) return
    setDeleting(true)
    setError(null)
    try {
      await deleteAssumption(assumption.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const toggle = (target: Pane) => setPane((cur) => (cur === target ? 'none' : target))

  return (
    <article
      id={`assumption-${assumption.id}`}
      className={`rounded-lg border bg-surface-1 p-4 transition-shadow ${
        highlighted ? 'border-accent ring-1 ring-accent' : 'border-hairline'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-caption ${typeMeta.badgeClass}`}>{t(typeMeta.labelKey)}</span>
        <span className={`rounded-full px-2 py-0.5 text-caption ${statusMeta.badgeClass}`}>
          {t(statusMeta.labelKey)}
        </span>
        {assumption.confidence === null && (
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-caption text-warning">
            {t('assumption.unassessedBadge')}
          </span>
        )}
        <span className="ml-auto text-caption text-ink-faint">
          {t('assumption.priorityScore')} <span className="text-body-sm text-ink">{assumption.priorityScore.toFixed(2)}</span>
        </span>
      </div>

      <p className="mt-2 text-body text-ink">{assumption.statement}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-muted">
        <span>{t('assumption.impactLabel', { value: assumption.impact })}</span>
        <span>{t('assumption.riskLabel', { value: assumption.risk })}</span>
        <span>
          {t('assumption.confidenceLabel', {
            value: assumption.confidence === null ? t('assumption.unassessed') : `${Math.round(assumption.confidence * 100)}%`,
          })}
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          <span className="text-ink-faint">{t('assumption.statusLabel')}</span>
          <select
            value={assumption.status}
            onChange={(e) => void handleStatus(e.target.value as AssumptionStatus)}
            aria-label={t('assumption.statusLabel')}
            className="min-h-9 rounded-btn border border-hairline-strong bg-surface-2 px-2 text-caption text-ink focus:border-accent-focus focus:outline-none"
          >
            {STATUS_OPTIONS.map(([value, meta]) => (
              <option key={value} value={value}>
                {t(meta.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={pane === 'edit'} onClick={() => toggle('edit')}>
          {t('common.edit')}
        </Button>
        <Button variant="ghost" aria-expanded={pane === 'audit'} onClick={() => toggle('audit')}>
          {t('assumption.history')}
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          {t('common.delete')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}

      {pane === 'edit' && (
        <div className="mt-4 border-t border-hairline pt-4">
          <AssumptionForm initial={assumption} onDone={() => setPane('none')} onCancel={() => setPane('none')} />
        </div>
      )}
      {pane === 'audit' && (
        <div className="mt-4 border-t border-hairline pt-4">
          <AssumptionAudit assumptionId={assumption.id} />
        </div>
      )}
    </article>
  )
}
