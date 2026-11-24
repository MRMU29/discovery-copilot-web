import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useT } from '@/lib/i18n'
import type { Assumption, Experiment } from '@/schemas/entities'
import { createDecision } from '@/services/decisions'

interface NewDecisionDialogProps {
  open: boolean
  projectId: string
  assumptions: Assumption[]
  experiments: Experiment[]
  onClose: () => void
}

/**
 * 新建决策：只写一行正文 + 可选依据 + 可选关联。
 * 决策不可编辑是产品决定，所以这里没有编辑态；方向变了就再记一条。
 */
export function NewDecisionDialog({
  open,
  projectId,
  assumptions,
  experiments,
  onClose,
}: NewDecisionDialogProps) {
  const t = useT()
  const [statement, setStatement] = useState('')
  const [rationale, setRationale] = useState('')
  const [linkedAssumptionIds, setLinkedAssumptionIds] = useState<string[]>([])
  const [linkedExperimentIds, setLinkedExperimentIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(current: string[], id: string, next: boolean): string[] {
    return next ? [...current, id] : current.filter((x) => x !== id)
  }

  function reset(): void {
    setStatement('')
    setRationale('')
    setLinkedAssumptionIds([])
    setLinkedExperimentIds([])
    setError(null)
  }

  async function handleSave(): Promise<void> {
    if (!statement.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await createDecision(projectId, {
        statement: statement.trim(),
        rationale: rationale.trim(),
        linkedAssumptionIds,
        linkedExperimentIds,
      })
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function handleClose(): void {
    if (saving) return
    reset()
    onClose()
  }

  const none = assumptions.length === 0 && experiments.length === 0

  return (
    <Dialog open={open} title={t('decisions.add')} onClose={handleClose} size="lg">
      <div className="space-y-5">
        <div>
          <label htmlFor="decision-statement" className="text-body-sm font-semibold text-ink-secondary">
            {t('decisions.statementLabel')}
          </label>
          <textarea
            id="decision-statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            rows={2}
            maxLength={200}
            placeholder={t('decisions.statementPlaceholder')}
            className="mt-2 w-full rounded-btn border border-hairline-strong bg-surface-2/50 px-4 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none focus:ring-2 focus:ring-accent-focus/30"
          />
          <p className="mt-1 text-caption text-ink-faint">{t('decisions.createdNotice')}</p>
        </div>

        <div>
          <label htmlFor="decision-rationale" className="text-body-sm font-semibold text-ink-secondary">
            {t('decisions.rationaleLabel')}
          </label>
          <textarea
            id="decision-rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('decisions.rationalePlaceholder')}
            className="mt-2 w-full rounded-btn border border-hairline-strong bg-surface-2/50 px-4 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none focus:ring-2 focus:ring-accent-focus/30"
          />
        </div>

        {none ? (
          <p className="text-body-sm text-ink-muted">{t('decisions.linkNone')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {assumptions.length > 0 && (
              <fieldset>
                <legend className="text-body-sm font-semibold text-ink-secondary">
                  {t('decisions.linkAssumptions')}
                </legend>
                <div className="mt-2 max-h-56 overflow-auto rounded-btn border border-hairline p-1">
                  {assumptions.map((assumption) => (
                    <label
                      key={assumption.id}
                      className="flex min-h-11 cursor-pointer items-start gap-2 rounded-btn px-2 py-1.5 text-body-sm text-ink hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-accent"
                        checked={linkedAssumptionIds.includes(assumption.id)}
                        onChange={(event) =>
                          setLinkedAssumptionIds((current) =>
                            toggle(current, assumption.id, event.target.checked),
                          )
                        }
                      />
                      <span className="min-w-0">{assumption.statement}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {experiments.length > 0 && (
              <fieldset>
                <legend className="text-body-sm font-semibold text-ink-secondary">
                  {t('decisions.linkExperiments')}
                </legend>
                <div className="mt-2 max-h-56 overflow-auto rounded-btn border border-hairline p-1">
                  {experiments.map((experiment) => (
                    <label
                      key={experiment.id}
                      className="flex min-h-11 cursor-pointer items-start gap-2 rounded-btn px-2 py-1.5 text-body-sm text-ink hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-accent"
                        checked={linkedExperimentIds.includes(experiment.id)}
                        onChange={(event) =>
                          setLinkedExperimentIds((current) =>
                            toggle(current, experiment.id, event.target.checked),
                          )
                        }
                      />
                      <span className="min-w-0">{experiment.hypothesis.slice(0, 60)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            {t('common.close')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!statement.trim() || saving}>
            {saving ? t('common.saving') : t('decisions.save')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
