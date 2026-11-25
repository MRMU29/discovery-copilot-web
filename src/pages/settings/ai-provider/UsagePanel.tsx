import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Button } from '@/components/ui/Button'
import { downloadFile } from '@/lib/download'
import { useT } from '@/lib/i18n'
import { groupUsageByPrompt, summarizeUsage, usageCsv, usageWindow } from '@/ai/usage'
import type { AiRequest } from '@/schemas/entities'
import { PROMPT_LABEL_KEYS, fmtUsd } from './shared'

export interface UsagePanelProps {
  rows: AiRequest[]
  projects: { id: string; name: string }[]
  monthUsage: { totalUsd: number; requestCount: number } | null
  monthlyBudgetUsd: number | null
}

/**
 * §6.4 用量视图：30 天曲线、任务分布、月度预算进度、按日表、最近 20 条明细。
 * 纯展示——行集与聚合口径分别来自 `ai/usage` 的 listUsageSince / usageWindow。
 */
export function UsagePanel({ rows, projects, monthUsage, monthlyBudgetUsd }: UsagePanelProps) {
  const t = useT()
  const summary = summarizeUsage(rows)
  const days = usageWindow(rows)
  const tasks = groupUsageByPrompt(rows)
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]))
  const details = [...rows].reverse().slice(0, 20)
  const budgetPercent =
    monthlyBudgetUsd && monthlyBudgetUsd > 0
      ? Math.min(100, Math.round(((monthUsage?.totalUsd ?? 0) / monthlyBudgetUsd) * 100))
      : 0

  function handleExportCsv() {
    downloadFile(`usage-${new Date().toISOString().slice(0, 10)}.csv`, usageCsv(rows), 'text/csv;charset=utf-8')
  }
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-ink">
        {t('settings.aiProvider.usageSummary', {
          count: summary.totalCount,
          input: summary.totalInputTokens.toLocaleString(),
          output: summary.totalOutputTokens.toLocaleString(),
          usd: fmtUsd(summary.totalUsd),
        })}
        <span className="ml-1 text-caption text-ink-faint">{t('settings.aiProvider.usagePricingNote')}</span>
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-hairline p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-ink-muted">{t('settings.aiProvider.usage30dHeading')}</p>
            <Button variant="ghost" onClick={handleExportCsv}>
              {t('settings.aiProvider.usageCsv')}
            </Button>
          </div>
          <div className="mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline)" vertical={false} />
                <XAxis
                  dataKey="date"
                  interval={6}
                  tickFormatter={(value: string) => value.slice(5)}
                  tick={{ fontSize: 10, fill: 'var(--color-ink-faint)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip formatter={(value) => [String(value), t('settings.aiProvider.usageChartCount')]} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#usageFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-caption text-ink-faint">{t('settings.aiProvider.usage30dNote')}</p>
        </section>

        <section className="rounded-lg border border-hairline p-3">
          <p className="text-caption text-ink-muted">{t('settings.aiProvider.usageTaskHeading')}</p>
          <ul className="mt-2 space-y-1 text-caption text-ink-secondary">
            {tasks.map((task) => (
              <li key={task.promptId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{t(PROMPT_LABEL_KEYS[task.promptId] ?? task.promptId)}</span>
                <span className="shrink-0 text-ink-faint">
                  {t('settings.aiProvider.usageTaskLine', { count: task.count, usd: fmtUsd(task.estimatedUsd) })}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-hairline pt-3">
            <p className="text-caption text-ink-muted">{t('settings.aiProvider.usageBudgetHeading')}</p>
            <p className="mt-1 text-caption text-ink-secondary">
              {monthlyBudgetUsd && monthlyBudgetUsd > 0
                ? t('settings.aiProvider.usageBudgetProgress', {
                    usd: fmtUsd(monthUsage?.totalUsd ?? 0),
                    limit: fmtUsd(monthlyBudgetUsd),
                    percent: budgetPercent,
                  })
                : t('settings.aiProvider.usageBudgetNone', { usd: fmtUsd(monthUsage?.totalUsd ?? 0) })}
            </p>
            {monthlyBudgetUsd && monthlyBudgetUsd > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full rounded-full ${budgetPercent >= 100 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[480px] text-left text-caption">
          <thead className="border-b border-hairline bg-surface-2 text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableDate')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableRequest')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableTokens')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('settings.aiProvider.usageTableUsd')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.days.map((day) => (
              <tr key={day.date} className="border-b border-hairline last:border-0 text-ink-secondary">
                <td className="px-3 py-1.5 text-ink">{day.date}</td>
                <td className="px-3 py-1.5">{day.count}</td>
                <td className="px-3 py-1.5">
                  {day.inputTokens.toLocaleString()} / {day.outputTokens.toLocaleString()}
                </td>
                <td className="px-3 py-1.5">{fmtUsd(day.estimatedUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-hairline bg-surface-2 p-3">
        <summary className="cursor-pointer text-caption text-ink-secondary">
          {t('settings.aiProvider.usageDetails', { count: details.length })}
        </summary>
        <ul className="mt-2 space-y-1.5">
          {details.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink-secondary">
              <span className="text-ink-faint">{row.createdAt.slice(5, 16).replace('T', ' ')}</span>
              <span className="text-ink">{projectNameById.get(row.projectId ?? '') ?? '—'}</span>
              <span>{row.model}</span>
              <span>{t(PROMPT_LABEL_KEYS[row.promptId] ?? row.promptId)}</span>
              <span className={row.status === 'ok' ? 'text-success' : 'text-danger'}>
                {row.status === 'ok' ? t('settings.aiProvider.usageOk') : (row.errorCode ?? t('settings.aiProvider.usageFailed'))}
              </span>
              <span className="text-ink-faint">
                {row.inputTokens}/{row.outputTokens} tok · {row.estimatedUsd != null ? fmtUsd(row.estimatedUsd) : '—'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
