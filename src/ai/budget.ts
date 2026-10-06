import { translate } from '@/lib/i18n'
import { getSettings } from '@/services/settings'
import { AIError } from './errors'
import { getMonthUsage } from './usage'

/**
 * Budget circuit breaker (§6.4): per-request and monthly USD budgets from
 * settings. On breach the request is REFUSED with a readable message and a
 * `budgetConfirmed` escape hatch — never a silent failure, never a silent
 * pass-through.
 */
export async function assertWithinBudget(
  estimatedUsd: number,
  opts: { confirmed?: boolean } = {},
): Promise<void> {
  if (opts.confirmed) return
  const settings = await getSettings()
  if (settings.perRequestBudgetUsd != null && estimatedUsd > settings.perRequestBudgetUsd) {
    throw new AIError(
      'BUDGET',
      translate('ai.budget.perRequest', { estimated: `$${estimatedUsd}`, limit: `$${settings.perRequestBudgetUsd}` }),
    )
  }
  const month = await getMonthUsage()
  if (settings.monthlyBudgetUsd != null && month.totalUsd + estimatedUsd > settings.monthlyBudgetUsd) {
    throw new AIError(
      'BUDGET',
      translate('ai.budget.monthly', {
        total: `$${month.totalUsd}`,
        estimated: `$${estimatedUsd}`,
        limit: `$${settings.monthlyBudgetUsd}`,
      }),
    )
  }
}
