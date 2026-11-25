import { useT } from '@/lib/i18n'

export type BudgetField = 'perRequest' | 'monthly'

export interface BudgetSectionProps {
  /** 输入框显示值（草稿优先，否则是已保存值）。 */
  perRequestValue: string
  monthlyValue: string
  onDraft: (field: BudgetField, value: string) => void
  onCommit: (field: BudgetField, value: string) => void
}

/** 预算上限：输入时只改草稿，失焦才提交（'' = 不设限）。 */
export function BudgetSection({ perRequestValue, monthlyValue, onDraft, onCommit }: BudgetSectionProps) {
  const t = useT()
  const inputClass =
    'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'
  return (
    <section aria-label={t('settings.aiProvider.budgetHeading')} className="space-y-3">
      <h2 className="text-eyebrow text-ink-muted">{t('settings.aiProvider.budgetHeading')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-caption text-ink-muted">
          {t('settings.aiProvider.budgetPerRequest')}
          <input
            type="number"
            min="0"
            step="0.01"
            value={perRequestValue}
            onChange={(e) => onDraft('perRequest', e.target.value)}
            onBlur={(e) => onCommit('perRequest', e.target.value)}
            placeholder={t('settings.aiProvider.budgetPerRequestPlaceholder')}
            className={inputClass}
          />
        </label>
        <label className="text-caption text-ink-muted">
          {t('settings.aiProvider.budgetMonthly')}
          <input
            type="number"
            min="0"
            step="0.5"
            value={monthlyValue}
            onChange={(e) => onDraft('monthly', e.target.value)}
            onBlur={(e) => onCommit('monthly', e.target.value)}
            placeholder={t('settings.aiProvider.budgetMonthlyPlaceholder')}
            className={inputClass}
          />
        </label>
      </div>
      <p className="text-caption text-ink-faint">{t('settings.aiProvider.budgetHint')}</p>
    </section>
  )
}
