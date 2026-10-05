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
      `预估费用 $${estimatedUsd} 超过单次预算 $${settings.perRequestBudgetUsd}。确认后可继续本次请求。`,
    )
  }
  const month = await getMonthUsage()
  if (settings.monthlyBudgetUsd != null && month.totalUsd + estimatedUsd > settings.monthlyBudgetUsd) {
    throw new AIError(
      'BUDGET',
      `本月 AI 用量 $${month.totalUsd} 加本次预估 $${estimatedUsd} 超过月度预算 $${settings.monthlyBudgetUsd}。确认后可继续本次请求。`,
    )
  }
}
