import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import { getProject } from '@/services/projects'
import { listAssumptionsByProject } from '@/services/assumptions'
import { AIIdentifyDialog } from './assumptions/AIIdentifyDialog'
import { AssumptionCard } from './assumptions/AssumptionCard'
import { AssumptionForm } from './assumptions/AssumptionForm'
import { MatrixTable, PriorityMatrix } from './assumptions/PriorityMatrix'

type View = 'matrix' | 'table'

export default function Assumptions({ projectId }: { projectId: string }) {
  const assumptions = useLiveQuery(() => listAssumptionsByProject(projectId), [projectId])
  const project = useLiveQuery(async () => {
    try {
      const p = await getProject(projectId)
      return p ? { name: p.name, description: p.description } : null
    } catch {
      return null
    }
  }, [projectId])
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const view: View = searchParams.get('view') === 'table' ? 'table' : 'matrix'
  const setView = (next: View) =>
    setSearchParams(next === 'table' ? { view: 'table' } : {}, { replace: true })

  if (assumptions === undefined) return <PageSkeleton />

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
          <h1 className="text-headline text-ink">假设</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            录入、评分（Impact × Risk × (1 − Confidence)）并用矩阵定位最该验证的假设 · 共{' '}
            {assumptions.length} 条
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAiOpen(true)}>AI 识别</Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            录入假设
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
          title="还没有假设"
          description="手动录入，或让 AI 从项目背景中识别八类风险假设——AI 建议经过你的审核才会入库。"
          action={<Button onClick={() => setAiOpen(true)}>用 AI 识别假设</Button>}
        />
      ) : (
        <>
          <section aria-label="Priority Matrix" className="rounded-lg border border-hairline bg-surface-1 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-subhead text-ink">Priority Matrix</h2>
              <div className="flex rounded-btn border border-hairline-strong p-0.5" role="group" aria-label="视图切换">
                <button
                  type="button"
                  aria-pressed={view === 'matrix'}
                  onClick={() => setView('matrix')}
                  className={`min-h-9 rounded-btn px-3 text-caption ${
                    view === 'matrix' ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  矩阵
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'table'}
                  onClick={() => setView('table')}
                  className={`min-h-9 rounded-btn px-3 text-caption ${
                    view === 'table' ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                  }`}
                >
                  表格
                </button>
              </div>
            </div>
            {view === 'matrix' ? (
              <PriorityMatrix items={notArchived} onSelectPoint={handleSelectPoint} />
            ) : (
              <MatrixTable items={visible} />
            )}
          </section>

          <section aria-label="假设列表" className="space-y-3">
            <label className="flex items-center gap-2 text-caption text-ink-muted">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="size-4 accent-accent"
              />
              显示已归档（不入矩阵）
            </label>
            {visible.length === 0 ? (
              <p className="text-body-sm text-ink-faint">没有可显示的假设。</p>
            ) : (
              visible.map((a) => (
                <AssumptionCard key={a.id} assumption={a} highlighted={highlightId === a.id} />
              ))
            )}
          </section>
        </>
      )}

      <Dialog open={formOpen} title="录入假设" onClose={() => setFormOpen(false)}>
        <AssumptionForm
          projectId={projectId}
          onDone={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>

      {aiOpen && (
        <AIIdentifyDialog
          projectId={projectId}
          projectName={project?.name}
          projectDescription={project?.description}
          onClose={() => setAiOpen(false)}
          onApplied={(created, skipped) =>
            setNotice(`已应用 ${created} 条 AI 建议假设${skipped > 0 ? `（容量不足，跳过 ${skipped} 条）` : ''}。`)
          }
        />
      )}
    </div>
  )
}
