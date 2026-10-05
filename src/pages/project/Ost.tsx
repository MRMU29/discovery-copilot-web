import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, PageSkeleton } from '@/components/common/states'
import type { OstNode } from '@/schemas/entities'
import { listAssumptionsByProject } from '@/services/assumptions'
import { listExperimentsByProject } from '@/services/experiments'
import { deleteOstNode, listOstNodesByProject, moveOstNode } from '@/services/ost'
import { descendantIds, ostTableRows } from './ost/ost-meta'
import { OstCanvas } from './ost/OstCanvas'
import { OstNodeForm } from './ost/OstNodeForm'

type View = 'tree' | 'table'

export default function Ost({ projectId }: { projectId: string }) {
  const nodes = useLiveQuery(() => listOstNodesByProject(projectId), [projectId])
  const assumptions = useLiveQuery(() => listAssumptionsByProject(projectId), [projectId])
  const experiments = useLiveQuery(() => listExperimentsByProject(projectId), [projectId])
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<OstNode | null>(null)
  const [cuttingId, setCuttingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const view: View = searchParams.get('view') === 'table' ? 'table' : 'tree'
  const setView = (next: View) =>
    setSearchParams(next === 'table' ? { view: 'table' } : {}, { replace: true })

  if (nodes === undefined || assumptions === undefined || experiments === undefined) {
    return <PageSkeleton />
  }

  async function handlePosition(id: string, x: number, y: number) {
    setError(null)
    try {
      await moveOstNode(id, { position: { x, y } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCut(id: string) {
    const turningOff = cuttingId === id
    setCuttingId(turningOff ? null : id)
    setNotice(turningOff ? null : '已剪切——Tab 选中一个合法父节点后按 V 粘贴，或再按一次 X 取消。')
  }

  async function handlePasteInto(targetId: string) {
    if (!cuttingId || !nodes) return
    const cutNode = nodes.find((n) => n.id === cuttingId)
    if (!cutNode) {
      setCuttingId(null)
      return
    }
    setError(null)
    try {
      await moveOstNode(cutNode.id, { parentId: targetId })
      setNotice(`已把「${cutNode.title.slice(0, 16)}…」挂到新父节点下。`)
      setCuttingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDelete(node: OstNode) {
    if (!nodes) return
    const doomed = descendantIds(nodes, node.id)
    const count = doomed.size + 1
    if (!window.confirm(`删除该节点及其子树（共 ${count} 个节点）？`)) return
    setError(null)
    try {
      const deleted = await deleteOstNode(node.id)
      setNotice(`已删除 ${deleted} 个节点。`)
      if (cuttingId && (cuttingId === node.id || doomed.has(cuttingId))) setCuttingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(node: OstNode) {
    setEditing(node)
    setFormOpen(true)
  }

  if (nodes.length === 0) {
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-headline text-ink">机会解决方案树</h1>
            <p className="mt-1 text-body-sm text-ink-muted">从目标结果到验证实验的逻辑链 · 共 0 节点</p>
          </div>
          <Button onClick={openCreate}>新建节点</Button>
        </header>
        <EmptyState
          title="还没有 OST 节点"
          description="生成机会解决方案树，梳理从结果到实验的逻辑：目标结果 → 机会痛点 → 解决方案 → 验证实验。"
          action={<Button onClick={openCreate}>创建第一个节点</Button>}
        />
        <Dialog open={formOpen} title="新建 OST 节点" onClose={() => setFormOpen(false)}>
          <OstNodeForm
            key="create"
            projectId={projectId}
            nodes={nodes}
            assumptions={assumptions}
            experiments={experiments}
            onDone={() => setFormOpen(false)}
            onCancel={() => setFormOpen(false)}
          />
        </Dialog>
      </div>
    )
  }

  const rows = view === 'table' ? ostTableRows(nodes, assumptions, experiments) : []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-headline text-ink">机会解决方案树</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            从目标结果到验证实验的逻辑链 · 共 {nodes.length} 节点
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreate}>新建节点</Button>
          <div className="flex rounded-btn border border-hairline-strong p-0.5" role="group" aria-label="视图切换">
            {(['tree', 'table'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-9 rounded-btn px-3 text-caption ${
                  view === v ? 'bg-accent text-white' : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {v === 'tree' ? '树' : '表格'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-body-sm text-ink">
          {notice}
        </div>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      {view === 'tree' ? (
        <>
          {cuttingId && (
            <p className="text-caption text-accent" role="status">
              剪切模式：Tab 到目标节点按 V 粘贴（仅可粘贴到对应类型父节点下）。
            </p>
          )}
          <OstCanvas
            nodes={nodes}
            assumptions={assumptions}
            experiments={experiments}
            cuttingId={cuttingId}
            onCut={handleCut}
            onPasteInto={(id) => void handlePasteInto(id)}
            onEdit={openEdit}
            onDelete={(node) => void handleDelete(node)}
            onPosition={(id, x, y) => void handlePosition(id, x, y)}
          />
          <p className="text-caption text-ink-faint">
            键盘等价操作：Tab 聚焦节点 → 方向键微调位置 / X 剪切 / V 粘贴换父 / Enter 编辑；所有操作也有对应按钮。
          </p>
        </>
      ) : (
        <section aria-label="OST 表格视图" className="overflow-x-auto rounded-lg border border-hairline bg-surface-1">
          <table className="w-full min-w-[760px] text-left text-caption">
            <thead className="border-b border-hairline text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">类型</th>
                <th scope="col" className="px-3 py-2 font-medium">标题</th>
                <th scope="col" className="px-3 py-2 font-medium">父节点</th>
                <th scope="col" className="px-3 py-2 font-medium">关联假设</th>
                <th scope="col" className="px-3 py-2 font-medium">关联实验</th>
                <th scope="col" className="px-3 py-2 font-medium">位置</th>
                <th scope="col" className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-hairline last:border-0 text-ink-secondary">
                  <td className="px-3 py-2">{row.typeLabel}</td>
                  <td className="px-3 py-2 text-ink">{row.title}</td>
                  <td className="px-3 py-2">{row.parentTitle}</td>
                  <td className="max-w-48 truncate px-3 py-2" title={row.assumptionTitle}>
                    {row.assumptionTitle}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2" title={row.experimentTitle}>
                    {row.experimentTitle}
                  </td>
                  <td className="px-3 py-2 text-ink-faint">
                    ({row.x}, {row.y})
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        const node = nodes.find((n) => n.id === row.id)
                        if (node) openEdit(node)
                      }}
                      className="min-h-7 rounded-btn px-1.5 text-caption text-accent hover:text-accent-hover"
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Dialog
        open={formOpen}
        title={editing ? '编辑节点' : '新建 OST 节点'}
        onClose={() => setFormOpen(false)}
      >
        <OstNodeForm
          key={editing?.id ?? 'create'}
          projectId={projectId}
          nodes={nodes}
          assumptions={assumptions}
          experiments={experiments}
          initial={editing ?? undefined}
          onDone={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      </Dialog>
    </div>
  )
}
