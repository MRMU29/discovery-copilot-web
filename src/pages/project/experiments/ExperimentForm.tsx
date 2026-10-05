import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import type { Assumption, Experiment } from '@/schemas/entities'
import { createExperiment, updateExperiment } from '@/services/experiments'

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
      setError('请填写实验假设与实验方法。')
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
          实验假设（可证伪，「若…则…」句式，含数字阈值更佳）
        </label>
        <textarea
          id="experiment-hypothesis"
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="例：若提供一键导入模板，则 60% 以上用户能在 5 分钟内完成首次导入"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-method" className="text-caption text-ink-muted">
          实验方法（写清对象、渠道、时长）
        </label>
        <textarea
          id="experiment-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="例：假门测试：引导页放置「一键导入」入口，运行 7 天记录展示与点击"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-criteria" className="text-caption text-ink-muted">
          成功阈值（可选，建议包含数字）
        </label>
        <textarea
          id="experiment-criteria"
          value={successCriteria ?? ''}
          onChange={(e) => setSuccessCriteria(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="例：入口点击率 ≥ 25%"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="experiment-assumption" className="text-caption text-ink-muted">
          关联假设（可选）
        </label>
        <select
          id="experiment-assumption"
          value={assumptionId ?? ''}
          onChange={(e) => setAssumptionId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">不关联</option>
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              [{ASSUMPTION_TYPE_META[a.type].label}] {a.statement.length > 32 ? `${a.statement.slice(0, 32)}…` : a.statement}
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
          {saving ? '保存中…' : editing ? '保存修改' : '添加实验'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  )
}
