import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import type { Assumption, Experiment } from '@/schemas/entities'
import { createExperiment, updateExperiment } from '@/services/experiments'
import { useT } from '@/lib/i18n'

interface ExperimentFormProps {
  /** Required when creating; editing passes `initial` instead. */
  projectId?: string
  initial?: Experiment
  assumptions: Assumption[]
  onDone: () => void
  onCancel: () => void
}

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

/** Create/edit form for one experiment. Status/result live on the card. */
export function ExperimentForm({ projectId, initial, assumptions, onDone, onCancel }: ExperimentFormProps) {
  const t = useT()
  const [hypothesis, setHypothesis] = useState(initial?.hypothesis ?? '')
  const [method, setMethod] = useState(initial?.method ?? '')
  const [successCriteria, setSuccessCriteria] = useState(initial?.successCriteria ?? '')
  const [assumptionId, setAssumptionId] = useState(initial?.assumptionId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = initial !== undefined

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!hypothesis.trim() || !method.trim()) {
      setError(t('experiment.required'))
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      hypothesis: hypothesis.trim(),
      method: method.trim(),
      successCriteria: successCriteria.trim() || null,
      assumptionId: assumptionId || null,
    }
    try {
      if (editing && initial) {
        await updateExperiment(initial.id, payload)
      } else if (projectId) {
        await createExperiment(projectId, payload)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="experiment-hypothesis" className="text-caption text-ink-muted">
          {t('experiment.hypothesisLabel')}
        </label>
        <textarea
          id="experiment-hypothesis"
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('experiment.hypothesisPlaceholder')}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-method" className="text-caption text-ink-muted">
          {t('experiment.methodFieldLabel')}
        </label>
        <textarea
          id="experiment-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={t('experiment.methodPlaceholder')}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-criteria" className="text-caption text-ink-muted">
          {t('experiment.criteriaFieldLabel')}
        </label>
        <textarea
          id="experiment-criteria"
          value={successCriteria ?? ''}
          onChange={(e) => setSuccessCriteria(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('experiment.criteriaPlaceholder')}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-assumption" className="text-caption text-ink-muted">
          {t('experiment.linkAssumption')}
        </label>
        <select
          id="experiment-assumption"
          value={assumptionId ?? ''}
          onChange={(e) => setAssumptionId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">{t('experiment.linkNone')}</option>
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              [{t(ASSUMPTION_TYPE_META[a.type].labelKey)}] {a.statement.length > 32 ? `${a.statement.slice(0, 32)}…` : a.statement}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !hypothesis.trim() || !method.trim()}>
          {saving ? t('common.saving') : editing ? t('common.saveEdit') : t('experiment.add')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
