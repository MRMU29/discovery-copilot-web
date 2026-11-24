import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { useT } from '@/lib/i18n'
import type { Experiment } from '@/schemas/entities'
import { listAssumptionsByProject } from '@/services/assumptions'
import { getProject } from '@/services/projects'
import { listExperimentsByProject } from '@/services/experiments'
import { AIExperimentDialog } from './experiments/AIExperimentDialog'
import { ExperimentBoard } from './experiments/ExperimentBoard'
import { ExperimentCard } from './experiments/ExperimentCard'
import { ExperimentForm } from './experiments/ExperimentForm'

type View = 'board' | 'list'

export default function Experiments({ projectId }: { projectId: string }) {
  const t = useT()
  const experiments = useLiveQuery(() => listExperimentsByProject(projectId), [projectId])
  const assumptions = useLiveQuery(() => listAssumptionsByProject(projectId), [projectId])
  const project = useLiveQuery(async () => {
    try {
      const p = await getProject(projectId)
      return p ? { name: p.name } : null
    } catch {
      return null
    }
  }, [projectId])
  const [formOpen, setFormOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Same URL-param convention as the assumptions matrix/table switch.
  const view: View = searchParams.get('view') === 'list' ? 'list' : 'board'
  const setView = (next: View) =>
    setSearchParams(next === 'list' ? { view: 'list' } : {}, { replace: true })

  if (experiments === undefined || assumptions === undefined) return <PageSkeleton />
  const projectName = project?.name

  const assumptionById = new Map(assumptions.map((a) => [a.id, a]))
  const resolveAssumption = (experiment: Experiment) =>
    experiment.assumptionId ? (assumptionById.get(experiment.assumptionId) ?? null) : null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-ink">{t('experiments.title')}</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            {t('experiments.desc', { count: experiments.length })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAiOpen(true)}>{t('experiments.aiCta')}</Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            {t('experiments.add')}
          </Button>
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-success/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-1" role="group" aria-label={t('experiments.board.viewAria')}>
        {(['board', 'list'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => setView(option)}
            className={`min-h-11 rounded-btn px-3 text-body-sm transition-colors ${
              view === option
                ? 'bg-accent-soft font-semibold text-accent'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {option === 'board' ? t('experiments.board.viewBoard') : t('experiments.board.viewList')}
          </button>
        ))}
      </div>

      {experiments.length === 0 ? (
        <EmptyState
          title={t('experiments.emptyTitle')}
          description={t('experiments.emptyDesc')}
          action={<Button onClick={() => setAiOpen(true)}>{t('experiments.emptyCta')}</Button>}
        />
      ) : view === 'board' ? (
        <ExperimentBoard
          experiments={experiments}
          assumptions={assumptions}
          assumptionById={assumptionById}
        />
      ) : (
        <section aria-label={t('experiments.listAria')} className="space-y-3">
          {experiments.map((e) => (
            <ExperimentCard
              key={e.id}
              experiment={e}
              assumption={resolveAssumption(e)}
              assumptions={assumptions}
            />
          ))}
        </section>
      )}

      <Dialog open={formOpen} title={t('experiments.formTitle')} onClose={() => setFormOpen(false)}>
        <ExperimentForm
          projectId={projectId}
          assumptions={assumptions}
          onDone={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      {aiOpen && (
        <AIExperimentDialog
          projectId={projectId}
          projectName={projectName}
          assumptions={assumptions}
          onClose={() => setAiOpen(false)}
          onApplied={(created, skipped) =>
            setNotice(
              t('experiments.appliedNotice', {
                created,
                skipped: skipped > 0 ? t('experiments.appliedSkipped', { skipped }) : '',
              }),
            )
          }
        />
      )}
    </div>
  )
}
