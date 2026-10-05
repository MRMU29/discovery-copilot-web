import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Assumption, Experiment, OstNode } from '@/schemas/entities'
import { OST_NODE_TYPES } from '@/schemas/entities'
import { createOstNode, moveOstNode } from '@/services/ost'
import { OST_TYPE_META, NODE_WIDTH, descendantIds, requiredParentType } from './ost-meta'

interface OstNodeFormProps {
  projectId: string
  nodes: OstNode[]
  assumptions: Assumption[]
  experiments: Experiment[]
  /** 编辑传入既有节点；创建省略。 */
  initial?: OstNode
  /** 创建时预选的类型（「添加子节点」入口按父类型推断）。 */
  defaultType?: OstNode['type']
  onDone: () => void
  onCancel: () => void
}

const inputClass =
  'mt-1 w-full rounded-btn border border-hairline-strong bg-surface-1 px-3 py-2 text-body text-ink placeholder:text-ink-faint focus:border-accent-focus focus:outline-none'

function truncate(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** 创建/编辑 OST 节点。类型在创建时选定；编辑可改标题/父节点/关联/位置。 */
export function OstNodeForm({
  projectId,
  nodes,
  assumptions,
  experiments,
  initial,
  defaultType,
  onDone,
  onCancel,
}: OstNodeFormProps) {
  const [type, setType] = useState<OstNode['type']>(initial?.type ?? defaultType ?? 'opportunity')
  const [parentId, setParentId] = useState(initial?.parentId ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [linkedAssumptionId, setLinkedAssumptionId] = useState(initial?.linkedAssumptionId ?? '')
  const [linkedExperimentId, setLinkedExperimentId] = useState(initial?.linkedExperimentId ?? '')
  const [x, setX] = useState(initial?.position.x ?? 120)
  const [y, setY] = useState(initial?.position.y ?? 120)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = initial !== undefined

  const editingDescendants = editing && initial ? descendantIds(nodes, initial.id) : new Set<string>()
  const requiredType = requiredParentType(type)
  const legalParents = requiredType
    ? nodes.filter((n) => n.type === requiredType && n.id !== initial?.id && !editingDescendants.has(n.id))
    : []

  function handleTypeChange(next: OstNode['type']) {
    setType(next)
    const required = requiredParentType(next)
    const current = nodes.find((n) => n.id === parentId)
    setParentId(required && current?.type === required ? parentId : '')
    // 新类型默认位置：排在第一个合法父节点下方，避免叠在原点。
    const anchor = nodes.find((n) => n.type === requiredParentType(next))
    if (!editing && anchor) {
      setX(Math.max(40, anchor.position.x - 40))
      setY(anchor.position.y + 230)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) {
      setError('请填写节点标题。')
      return
    }
    if (requiredType && !parentId) {
      setError(`${OST_TYPE_META[type].label} 必须挂在「${OST_TYPE_META[requiredType].label}」之下。`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing && initial) {
        await moveOstNode(initial.id, {
          title: title.trim(),
          parentId: requiredType ? parentId : null,
          position: { x, y },
          linkedAssumptionId: linkedAssumptionId || null,
          linkedExperimentId: linkedExperimentId || null,
        })
      } else {
        await createOstNode(projectId, {
          type,
          parentId: requiredType ? parentId : null,
          title: title.trim(),
          position: { x, y },
          linkedAssumptionId: linkedAssumptionId || null,
          linkedExperimentId: linkedExperimentId || null,
        })
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="ost-type" className="text-caption text-ink-muted">
          节点类型{editing && '（创建后不可更改）'}
        </label>
        <select
          id="ost-type"
          value={type}
          disabled={editing}
          onChange={(e) => handleTypeChange(e.target.value as OstNode['type'])}
          className={`${inputClass} min-h-11`}
        >
          {OST_NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {OST_TYPE_META[t].label}
              {t === 'outcome' ? '（根节点）' : ''}
            </option>
          ))}
        </select>
      </div>

      {requiredType && (
        <div>
          <label htmlFor="ost-parent" className="text-caption text-ink-muted">
            父节点（必须是「{OST_TYPE_META[requiredType].label}」）
          </label>
          <select
            id="ost-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={`${inputClass} min-h-11`}
          >
            <option value="">{legalParents.length === 0 ? '暂无可选父节点' : '请选择…'}</option>
            {legalParents.map((n) => (
              <option key={n.id} value={n.id}>
                {truncate(n.title)}
              </option>
            ))}
          </select>
          {legalParents.length === 0 && (
            <p className="mt-1 text-caption text-warning">先创建一个「{OST_TYPE_META[requiredType].label}」节点。</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ost-title" className="text-caption text-ink-muted">
          标题（一句话说清这个节点）
        </label>
        <input
          id="ost-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={
            type === 'outcome'
              ? '例：3 个月内验证订阅需求真实存在'
              : type === 'opportunity'
                ? '例：养宠家庭想喂鲜食，但被制作时间劝退'
                : type === 'solution'
                  ? '例：每周订阅菜单 + 冷链配送'
                  : '例：实验：假门测试订阅意向'
          }
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="ost-assumption" className="text-caption text-ink-muted">
          关联假设（可选）
        </label>
        <select
          id="ost-assumption"
          value={linkedAssumptionId ?? ''}
          onChange={(e) => setLinkedAssumptionId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">不关联</option>
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              {truncate(a.statement, 36)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ost-experiment" className="text-caption text-ink-muted">
          关联实验（可选）
        </label>
        <select
          id="ost-experiment"
          value={linkedExperimentId ?? ''}
          onChange={(e) => setLinkedExperimentId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">不关联</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {truncate(e.hypothesis, 36)}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-caption text-ink-muted">
          位置（拖拽的表单等价操作；画布宽约 {NODE_WIDTH * 10}px）
        </legend>
        <div className="mt-1 flex items-center gap-3">
          <label className="flex items-center gap-1 text-caption text-ink-muted">
            X
            <input
              type="number"
              min={0}
              step={10}
              value={x}
              onChange={(e) => setX(Math.max(0, Number(e.target.value)))}
              aria-label="节点 X 坐标"
              className="w-24 rounded-btn border border-hairline-strong bg-surface-1 px-2 py-1.5 text-caption text-ink focus:border-accent-focus focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1 text-caption text-ink-muted">
            Y
            <input
              type="number"
              min={0}
              step={10}
              value={y}
              onChange={(e) => setY(Math.max(0, Number(e.target.value)))}
              aria-label="节点 Y 坐标"
              className="w-24 rounded-btn border border-hairline-strong bg-surface-1 px-2 py-1.5 text-caption text-ink focus:border-accent-focus focus:outline-none"
            />
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? '保存中…' : editing ? '保存修改' : '创建节点'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  )
}
