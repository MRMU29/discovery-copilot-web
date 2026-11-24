import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { CAPS } from '@/lib/limits'
import { parseAssumptionBatch, type BatchErrorReason } from '@/lib/assumption-batch'
import { ASSUMPTION_TYPE_META } from '@/lib/assumption-meta'
import { createAssumptions } from '@/services/assumptions'
import { useT } from '@/lib/i18n'

interface BatchAssumptionDialogProps {
  open: boolean
  projectId: string
  /** Current assumption count — the dialog trims the batch to the remaining capacity. */
  existingCount: number
  onClose: () => void
  onDone: (created: number) => void
}

const REASON_KEYS: Record<BatchErrorReason, string> = {
  type: 'assumptions.batch.errorType',
  impact: 'assumptions.batch.errorImpact',
  risk: 'assumptions.batch.errorRisk',
  statement: 'assumptions.batch.errorStatement',
  length: 'assumptions.batch.errorLength',
  columns: 'assumptions.batch.errorColumns',
}

/**
 * Paste → parse → review → apply. The parser is pure and lives in lib; this
 * component only maps parse results to copy and enforces the capacity trim.
 */
export function BatchAssumptionDialog({
  open,
  projectId,
  existingCount,
  onClose,
  onDone,
}: BatchAssumptionDialogProps) {
  const t = useT()
  const [text, setText] = useState('')
  const [deselected, setDeselected] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { rows, errors } = useMemo(() => parseAssumptionBatch(text), [text])
  const remaining = Math.max(0, CAPS.assumptions - existingCount)
  const selected = rows.filter((row) => !deselected.has(row.line))
  const applicable = selected.slice(0, remaining)
  const overflow = Math.max(0, selected.length - remaining)
  const allSelected = rows.length > 0 && deselected.size === 0

  function toggleLine(line: number, checked: boolean) {
    setDeselected((current) => {
      const next = new Set(current)
      if (checked) next.delete(line)
      else next.add(line)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setDeselected(checked ? new Set() : new Set(rows.map((row) => row.line)))
  }

  async function handleApply() {
    if (applicable.length === 0 || applying) return
    setApplying(true)
    setError(null)
    try {
      await createAssumptions(
        projectId,
        applicable.map((row) => ({
          type: row.type,
          statement: row.statement,
          impact: row.impact,
          risk: row.risk,
        })),
      )
      onDone(applicable.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} title={t('assumptions.batch.title')} onClose={onClose} size="lg">
      <div className="space-y-4">
        <p className="text-body-sm text-ink-muted">{t('assumptions.batch.desc')}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={t('assumptions.batch.placeholder')}
          className="w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 font-mono text-body-sm text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none"
        />

        <p className="text-caption text-ink-secondary">
          {t('assumptions.batch.summary', { rows: rows.length, errors: errors.length })}
        </p>
        {overflow > 0 && (
          <p role="status" className="text-caption text-warning">
            {t('assumptions.batch.overCapacity', { overflow, remaining })}
          </p>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-2 text-caption text-ink-muted">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                className="size-4 accent-accent"
              />
              {t('assumptions.batch.selectAll')}
            </label>
            <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-hairline">
              {rows.map((row) => (
                <li key={row.line}>
                  <label className="flex min-h-11 items-start gap-2 px-3 py-2 text-body-sm text-ink hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={!deselected.has(row.line)}
                      onChange={(e) => toggleLine(row.line, e.target.checked)}
                      className="mt-1 size-4 shrink-0 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="mr-2 rounded-full border border-hairline bg-surface-2 px-1.5 text-caption text-ink-muted">
                        {t(ASSUMPTION_TYPE_META[row.type].labelKey)}
                      </span>
                      {row.statement}
                      <span className="ml-2 text-caption text-ink-faint">
                        {row.impact} / {row.risk}
                      </span>
                      {row.usedDefaults && (
                        <span className="ml-2 text-caption text-ink-faint">
                          {t('assumptions.batch.defaultsTag')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errors.length > 0 && (
          <div className="space-y-1">
            <p className="text-caption font-semibold text-danger">{t('assumptions.batch.errorsHeading')}</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-caption text-danger">
              {errors.map((item) => (
                <li key={item.line}>
                  {t('assumptions.batch.errorLine', { line: item.line, reason: t(REASON_KEYS[item.reason]) })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleApply()} disabled={applying || applicable.length === 0}>
            {applying ? t('common.saving') : t('assumptions.batch.apply', { count: applicable.length })}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
