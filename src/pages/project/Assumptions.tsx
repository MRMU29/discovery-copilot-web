import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { useT } from '@/lib/i18n'
import { getProject } from '@/services/projects'
import { listAssumptionsByProject } from '@/services/assumptions'
import { listExperimentsByProject } from '@/services/experiments'
import { AIIdentifyDialog } from './assumptions/AIIdentifyDialog'
import { AssumptionCard } from './assumptions/AssumptionCard'
import { AssumptionForm } from './assumptions/AssumptionForm'
import { BatchAssumptionDialog } from './assumptions/BatchAssumptionDialog'
import { MatrixTable, PriorityMatrix } from './assumptions/PriorityMatrix'

type View = 'matrix' | 'table'

type OutcomeSummary = { supported: number; refuted: number; inconclusive: number }

export default function Assumptions({ projectId }: { projectId: string }) {
  const t = useT()
  const assumptions = useLiveQuery(() => listAssumptionsByProject(projectId), [projectId])
  const experiments = useLiveQuery(() => listExperimentsByProject(projectId), [projectId])
  const project = useLiveQuery(async () => {
    try {
      const p = await getProject(projectId)
      return p ? { name: p.name, description: p.description } : null
    } catch {
      return null
    }
  }, [projectId])
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpenState, setFormOpenState] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const view: View = searchParams.get('view') === 'table' ? 'table' : 'matrix'
  const setView = (next: View) =>
    setSearchParams(next === 'table' ? { view: 'table' } : {}, { replace: true })

  // Cross-page entry from the command palette: /assumptions?new=assumption.
  // Derived instead of an effect so closing the form does not fight the URL.
  const wantsNew = searchParams.get('new') === 'assumption'
  const formOpen = formOpenState || wantsNew

  function closeForm() {
    setFormOpenState(false)
    if (!searchParams.has('new')) return
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }

  if (assumptions === undefined || experiments === undefined) return <PageSkeleton />

  // Derived, never stored: how many experiments support/refute each assumption.
  const outcomeSummary = new Map<string, OutcomeSummary>()
  for (const experiment of experiments) {
    if (!experiment.assumptionId || !experiment.outcome) continue
    const current = outcomeSummary.get(experiment.assumptionId) ?? {
      supported: 0,
      refuted: 0,
      inconclusive: 0,
    }
    current[experiment.outcome] += 1
    outcomeSummary.set(experiment.assumptionId, current)
  }

  const notArchived = assumptions.filter((a) => a.status !== 'archived')
  const visible = showArchived ? assumptions : notArchived

  function handleSelectPoint(id: string) {
    setHighlightId(id)
    document.getElementById(`assumption-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 2000)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-subhead text-ink sm:text-headline">{t('assumptions.title')}</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            {t('assumptions.desc', { count: assumptions.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAiOpen(true)}>{t('assumptions.aiCta')}</Button>
          <Button variant="secondary" onClick={() => setBatchOpen(true)}>
            {t('assumptions.batch.cta')}
          </Button>
          <Button variant="secondary" onClick={() => setFormOpenState(true)}>
            {t('assumptions.add')}
          </Button>
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-success/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {notice}
        </div>
      )}

      {assumptions.length === 0 ? (
        <EmptyState
          title={t('assumptions.emptyTitle')}
          description={t('assumptions.emptyDesc')}
          action={<Button onClick={() => setAiOpen(true)}>{t('assumptions.emptyCta')}</Button>}
        />
      ) : (
        <>
          <section aria-label="Priority Matrix" className="rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-subhead text-ink">{t('assumptions.matrixHeading')}</h2>
              <div className="flex rounded-btn border border-hairline-strong p-0.5" role="group" aria-label={t('assumptions.viewToggle')}>
                <button
                  type="button"
                  aria-pressed={view === 'matrix'}
                  onClick={() => setView('matrix')}
                  className={`min-h-9 rounded-btn px-3 text-caption ${
                    view === 'matrix' ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {t('assumptions.viewMatrix')}
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'table'}
                  onClick={() => setView('table')}
                  className={`min-h-9 rounded-btn px-3 text-caption ${
                    view === 'table' ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  {t('assumptions.viewTable')}
                </button>
              </div>
            </div>
            {view === 'matrix' ? (
              <PriorityMatrix items={notArchived} onSelectPoint={handleSelectPoint} />
            ) : (
              <MatrixTable items={visible} />
            )}
          </section>

          <section aria-label={t('assumptions.listAria')} className="space-y-3">
            <label className="flex items-center gap-2 text-caption text-ink-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-4 accent-accent"
              />
              {t('assumptions.showArchived')}
            </label>
            {visible.length === 0 ? (
              <p className="text-body-sm text-ink-faint">{t('assumptions.noneVisible')}</p>
            ) : (
              visible.map((a) => (
                <AssumptionCard
                  key={a.id}
                  assumption={a}
                  highlighted={highlightId === a.id}
                  experimentSummary={outcomeSummary.get(a.id)}
                />
              ))
            )}
          </section>
        </>
      )}

      <Dialog open={formOpen} title={t('assumptions.formTitle')} onClose={closeForm}>
        <AssumptionForm
          projectId={projectId}
          onDone={closeForm}
          onCancel={closeForm}
        />
      </Dialog>

      <BatchAssumptionDialog
        open={batchOpen}
        projectId={projectId}
        existingCount={assumptions.length}
        onClose={() => setBatchOpen(false)}
        onDone={(created) => {
          setBatchOpen(false)
          setNotice(t('assumptions.batch.done', { count: created }))
        }}
      />

      {aiOpen && (
        <AIIdentifyDialog
          projectId={projectId}
          projectName={project?.name}
          projectDescription={project?.description}
          onClose={() => setAiOpen(false)}
          onApplied={(created, skipped) =>
            setNotice(
              t('assumptions.appliedNotice', {
                created,
                skipped: skipped > 0 ? t('assumptions.appliedSkipped', { skipped }) : '',
              }),
            )
          }
        />
      )}
    </div>
  )
}
