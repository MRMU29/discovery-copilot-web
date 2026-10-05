import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import type { Experiment } from '@/schemas/entities'
import { listAssumptionsByProject } from '@/services/assumptions'
import { getProject } from '@/services/projects'
import { listExperimentsByProject } from '@/services/experiments'
import { AIExperimentDialog } from './experiments/AIExperimentDialog'
import { ExperimentCard } from './experiments/ExperimentCard'
import { ExperimentForm } from './experiments/ExperimentForm'

export default function Experiments({ projectId }: { projectId: string }) {
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

  if (experiments === undefined || assumptions === undefined) return <PageSkeleton />
  const projectName = project?.name

  const assumptionById = new Map(assumptions.map((a) => [a.id, a]))
  const resolveAssumption = (experiment: Experiment) =>
    experiment.assumptionId ? (assumptionById.get(experiment.assumptionId) ?? null) : null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-ink">实验</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            为关键假设设计低成本验证实验（测行为、最小投入、明确成功阈值） · 共 {experiments.length} 条
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAiOpen(true)}>AI 设计实验</Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            新建实验
          </Button>
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-success/40 bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {notice}
        </div>
      )}

      {experiments.length === 0 ? (
        <EmptyState
          title="还没有实验"
          description="为高优先级假设设计一个低成本验证实验——测行为、最小投入、明确成功阈值；AI 建议先审核再入库。"
          action={<Button onClick={() => setAiOpen(true)}>用 AI 设计实验</Button>}
        />
      ) : (
        <section aria-label="实验列表" className="space-y-3">
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

      <Dialog open={formOpen} title="新建实验" onClose={() => setFormOpen(false)}>
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
            setNotice(`已应用 ${created} 条 AI 建议实验${skipped > 0 ? `（容量不足，跳过 ${skipped} 条）` : ''}。`)
          }
        />
      )}
    </div>
  )
}
