import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/common/states'
import { confirmAction } from '@/lib/confirm'
import { useT } from '@/lib/i18n'
import type { Decision } from '@/schemas/entities'
import { listAssumptionsByProject } from '@/services/assumptions'
import { listDecisionsByProject, supersedeDecision } from '@/services/decisions'
import { listExperimentsByProject } from '@/services/experiments'
import { NewDecisionDialog } from './decisions/NewDecisionDialog'

/**
 * 决策日志（v0.2.3-C）：只追加、可标注被推翻，不提供编辑/删除。
 * 排序由 service 负责（active 在前，组内按 decidedAt 倒序），页面只管展示。
 */
export default function Decisions({ projectId }: { projectId: string }) {
  const t = useT()
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    const [decisions, assumptions, experiments] = await Promise.all([
      listDecisionsByProject(projectId),
      listAssumptionsByProject(projectId),
      listExperimentsByProject(projectId),
    ])
    return { decisions, assumptions, experiments }
  }, [projectId])

  if (data === undefined) return <PageSkeleton />

  async function handleSupersede(decision: Decision): Promise<void> {
    if (!(await confirmAction({ title: t('confirm.confirmTitle'), body: t('decisions.supersedeConfirm') }))) return
    setError(null)
    try {
      await supersedeDecision(decision.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-subhead text-ink">{t('decisions.title')}</h2>
          <p className="mt-1 max-w-xl text-body-sm text-ink-muted">{t('decisions.desc')}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>{t('decisions.add')}</Button>
      </header>

      {error && <ErrorState message={error} />}

      {data.decisions.length === 0 ? (
        <EmptyState title={t('decisions.emptyTitle')} description={t('decisions.emptyDesc')} />
      ) : (
        <ul className="space-y-3">
          {data.decisions.map((decision) => {
            const superseded = decision.status === 'superseded'
            const links: string[] = []
            if (decision.linkedAssumptionIds.length > 0 || decision.linkedExperimentIds.length > 0) {
              links.push(
                t('decisions.linkedCount', {
                  assumptions: decision.linkedAssumptionIds.length,
                  experiments: decision.linkedExperimentIds.length,
                }),
              )
            }
            return (
              <li
                key={decision.id}
                className={`rounded-lg border border-hairline bg-surface-1 p-4 shadow-card ${
                  superseded ? 'opacity-70' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p
                    className={`min-w-0 flex-1 text-card-title ${
                      superseded ? 'text-ink-muted line-through' : 'text-ink'
                    }`}
                  >
                    {decision.statement}
                  </p>
                  {!superseded && (
                    <Button variant="ghost" onClick={() => void handleSupersede(decision)}>
                      {t('decisions.supersede')}
                    </Button>
                  )}
                </div>

                {decision.rationale && (
                  <p className="mt-2 text-body-sm text-ink-muted">{decision.rationale}</p>
                )}

                <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-caption text-ink-faint">
                  <span>{t('decisions.decidedOn', { date: decision.decidedAt.slice(0, 10) })}</span>
                  {links.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                  {superseded && decision.supersededAt && (
                    <span>{t('decisions.supersededAt', { date: decision.supersededAt.slice(0, 10) })}</span>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      <NewDecisionDialog
        open={formOpen}
        projectId={projectId}
        assumptions={data.assumptions}
        experiments={data.experiments}
        onClose={() => setFormOpen(false)}
      />
    </div>
  )
}
