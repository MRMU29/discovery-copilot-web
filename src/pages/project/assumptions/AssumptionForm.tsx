import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ASSUMPTION_TYPE_META, type AssumptionType } from '@/lib/assumption-meta'
import { ASSUMPTION_TYPES, type Assumption } from '@/schemas/entities'
import { useT } from '@/lib/i18n'
import { createAssumption, updateAssumption } from '@/services/assumptions'

const SCALE = [1, 2, 3, 4, 5] as const

interface AssumptionFormProps {
  /** Required when creating; editing passes `initial` instead. */
  projectId?: string
  initial?: Assumption
  onDone: () => void
  onCancel: () => void
}

function ScaleField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  hint: string
}) {
  return (
    <fieldset>
      <legend className="text-caption text-ink-muted">{label}</legend>
      <div className="mt-1 flex gap-1.5" role="group" aria-label={label}>
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`min-h-11 w-11 rounded-btn border text-body-sm transition-colors ${
              value === n
                ? 'border-accent bg-accent text-white'
                : 'border-hairline-strong bg-surface-2 text-ink-secondary hover:bg-surface-3'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1 text-caption text-ink-faint">{hint}</p>
    </fieldset>
  )
}

/** Create/edit form for one assumption. Score changes write a ScoreEvent (service layer). */
export function AssumptionForm({ projectId, initial, onDone, onCancel }: AssumptionFormProps) {
  const t = useT()
  const [statement, setStatement] = useState(initial?.statement ?? '')
  const [type, setType] = useState<AssumptionType>(initial?.type ?? 'value')
  const [impact, setImpact] = useState(initial?.impact ?? 3)
  const [risk, setRisk] = useState(initial?.risk ?? 3)
  const [confidenceSet, setConfidenceSet] = useState(initial ? initial.confidence !== null : false)
  const [confidencePercent, setConfidencePercent] = useState(
    Math.round((initial?.confidence ?? 0) * 100),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = initial !== undefined

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = statement.trim()
    if (!trimmed) {
      setError(t('assumption.statementRequired'))
      return
    }
    setSaving(true)
    setError(null)
    const confidence = confidenceSet ? confidencePercent / 100 : null
    try {
      if (editing && initial) {
        await updateAssumption(
          initial.id,
          { statement: trimmed, type, impact, risk, confidence },
          { changedBy: 'user' },
        )
      } else if (projectId) {
        await createAssumption(
          projectId,
          { statement: trimmed, type, impact, risk, confidence },
          { changedBy: 'user' },
        )
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
        <label htmlFor="assumption-statement" className="text-caption text-ink-muted">
          {t('assumption.statementLabel')}
        </label>
        <textarea
          id="assumption-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('assumption.statementPlaceholder')}
          className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="assumption-type" className="text-caption text-ink-muted">
          {t('assumption.typeLabel')}
        </label>
        <select
          id="assumption-type"
          value={type}
          onChange={(e) => setType(e.target.value as AssumptionType)}
          className="mt-1 min-h-11 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink focus:border-accent-focus focus:outline-none"
        >
          {ASSUMPTION_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(ASSUMPTION_TYPE_META[ty].labelKey)}
            </option>
          ))}
        </select>
      </div>

      <ScaleField label={t('assumption.impactField')} value={impact} onChange={setImpact} hint={t('assumption.impactHint')} />
      <ScaleField label={t('assumption.riskField')} value={risk} onChange={setRisk} hint={t('assumption.riskHint')} />

      <fieldset>
        <legend className="text-caption text-ink-muted">{t('assumption.confidenceField')}</legend>
        <label className="mt-1 flex min-h-11 items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={confidenceSet}
            onChange={(e) => setConfidenceSet(e.target.checked)}
            className="size-4 accent-accent"
          />
          {t('assumption.confidenceEvaluated')}
        </label>
        {confidenceSet && (
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={confidencePercent}
              onChange={(e) => setConfidencePercent(Number(e.target.value))}
              aria-label={t('assumption.confidenceAria')}
              className="h-11 flex-1 accent-accent"
            />
            <span className="w-12 text-right text-body-sm text-ink">{confidencePercent}%</span>
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !statement.trim()}>
          {saving ? t('common.saving') : editing ? t('common.saveEdit') : t('assumption.add')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
