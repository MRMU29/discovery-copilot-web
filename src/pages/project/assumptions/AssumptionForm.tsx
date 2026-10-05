import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ASSUMPTION_TYPE_META, type AssumptionType } from '@/lib/assumption-meta'
import { ASSUMPTION_TYPES, type Assumption } from '@/schemas/entities'
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
      setError('请填写假设陈述。')
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
          假设陈述（一句话，具体且可证伪）
        </label>
        <textarea
          id="assumption-statement"
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="例：目标用户愿意为自动整理笔记每月支付 10 元"
          className="mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="assumption-type" className="text-caption text-ink-muted">
          风险类别
        </label>
        <select
          id="assumption-type"
          value={type}
          onChange={(e) => setType(e.target.value as AssumptionType)}
          className="mt-1 min-h-11 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 text-body text-ink focus:border-accent-focus focus:outline-none"
        >
          {ASSUMPTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSUMPTION_TYPE_META[t].label}
            </option>
          ))}
        </select>
      </div>

      <ScaleField label="影响 Impact（1–5）" value={impact} onChange={setImpact} hint="价值越大、波及用户越多，分越高" />
      <ScaleField label="风险 Risk（1–5）" value={risk} onChange={setRisk} hint="判断错误时代价越大，分越高" />

      <fieldset>
        <legend className="text-caption text-ink-muted">信心 Confidence（0–100%）</legend>
        <label className="mt-1 flex min-h-11 items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={confidenceSet}
            onChange={(e) => setConfidenceSet(e.target.checked)}
            className="size-4 accent-accent"
          />
          已评估证据（不勾选 = 证据未评估，按 0 计入优先分）
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
              aria-label="信心百分比"
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
          {saving ? '保存中…' : editing ? '保存修改' : '添加假设'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  )
}
