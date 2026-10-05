import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Assumption, Experiment } from '@/schemas/entities'
import { deleteExperiment, updateExperiment } from '@/services/experiments'
import { EXPERIMENT_STATUS_META, type ExperimentStatus } from './experiment-meta'
import { ExperimentForm } from './ExperimentForm'

type Pane = 'none' | 'edit' | 'result'

const STATUS_OPTIONS = Object.entries(EXPERIMENT_STATUS_META)

interface ExperimentCardProps {
  experiment: Experiment
  /** Resolved linked assumption; null renders the 未关联 badge. */
  assumption: Assumption | null
  assumptions: Assumption[]
}

export function ExperimentCard({ experiment, assumption, assumptions }: ExperimentCardProps) {
  const [pane, setPane] = useState<Pane>('none')
  const [resultDraft, setResultDraft] = useState(experiment.result ?? '')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusMeta = EXPERIMENT_STATUS_META[experiment.status]

  async function handleStatus(status: ExperimentStatus) {
    setError(null)
    try {
      await updateExperiment(experiment.id, { status })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSaveResult() {
    setError(null)
    try {
      await updateExperiment(experiment.id, { result: resultDraft.trim() || null })
      setPane('none')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete() {
    if (!window.confirm('删除该实验？关联的 OST 节点将解除关联。')) return
    setDeleting(true)
    setError(null)
    try {
      await deleteExperiment(experiment.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
    }
  }

  const toggle = (target: Pane) => setPane((cur) => (cur === target ? 'none' : target))

  return (
    <article className="rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-caption ${statusMeta.badgeClass}`}>
          {statusMeta.label}
        </span>
        {assumption ? (
          <span className="rounded-full bg-tint-blue px-2 py-0.5 text-caption text-surface-1" title={assumption.statement}>
            假设：{assumption.statement.length > 24 ? `${assumption.statement.slice(0, 24)}…` : assumption.statement}
          </span>
        ) : (
          <span className="rounded-full border border-hairline bg-surface-3 px-2 py-0.5 text-caption text-ink-faint">
            未关联假设
          </span>
        )}
      </div>

      <p className="mt-2 text-body font-medium text-ink">{experiment.hypothesis}</p>
      <dl className="mt-2 space-y-1 text-caption text-ink-muted">
        <div>
          <dt className="inline text-ink-faint">方法：</dt>
          <dd className="inline">{experiment.method}</dd>
        </div>
        {experiment.successCriteria && (
          <div>
            <dt className="inline text-ink-faint">成功阈值：</dt>
            <dd className="inline">{experiment.successCriteria}</dd>
          </div>
        )}
        {experiment.result && (
          <div>
            <dt className="inline text-ink-faint">结果：</dt>
            <dd className="inline whitespace-pre-wrap">{experiment.result}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-ink-muted">
        <label className="ml-auto flex items-center gap-1.5">
          <span className="text-ink-faint">状态</span>
          <select
            value={experiment.status}
            onChange={(e) => void handleStatus(e.target.value as ExperimentStatus)}
            aria-label="实验状态"
            className="min-h-9 rounded-btn border border-hairline-strong bg-surface-2 px-2 text-caption text-ink focus:border-accent-focus focus:outline-none"
          >
            {STATUS_OPTIONS.map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={pane === 'edit'} onClick={() => toggle('edit')}>
          编辑
        </Button>
        <Button variant="ghost" aria-expanded={pane === 'result'} onClick={() => toggle('result')}>
          {experiment.result ? '修改结果' : '记录结果'}
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={deleting}>
          删除
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {error}
        </p>
      )}

      {pane === 'edit' && (
        <div className="mt-4 border-t border-hairline pt-4">
          <ExperimentForm
            initial={experiment}
            assumptions={assumptions}
            onDone={() => setPane('none')}
            onCancel={() => setPane('none')}
          />
        </div>
      )}
      {pane === 'result' && (
        <div className="mt-4 space-y-2 border-t border-hairline pt-4">
          <label htmlFor={`experiment-result-${experiment.id}`} className="text-caption text-ink-muted">
            实验结果（观察到的行为数据与结论）
          </label>
          <textarea
            id={`experiment-result-${experiment.id}`}
            value={resultDraft}
            onChange={(e) => setResultDraft(e.target.value)}
            rows={3}
            maxLength={5000}
            placeholder="例：7 天 312 次展示 89 次点击（28.5%），达到阈值，假设成立"
            className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
          />
          <div className="flex gap-2">
            <Button onClick={handleSaveResult}>保存结果</Button>
            <Button variant="ghost" onClick={() => setPane('none')}>
              取消
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
