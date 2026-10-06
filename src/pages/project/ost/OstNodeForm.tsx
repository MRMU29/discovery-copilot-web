import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Assumption, Experiment, OstNode } from '@/schemas/entities'
import { OST_NODE_TYPES } from '@/schemas/entities'
import { createOstNode, moveOstNode } from '@/services/ost'
import { OST_TYPE_META, NODE_WIDTH, descendantIds, requiredParentType } from './ost-meta'
import { useT } from '@/lib/i18n'

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
  const t = useT()
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
      setError(t('ost.titleRequired'))
      return
    }
    if (requiredType && !parentId) {
      setError(t('ost.parentRule', { type: t(OST_TYPE_META[type].labelKey), parent: t(OST_TYPE_META[requiredType].labelKey) }))
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
          {t('ost.typeLabel')}{editing ? t('ost.typeLocked') : ''}
        </label>
        <select
          id="ost-type"
          value={type}
          disabled={editing}
          onChange={(e) => handleTypeChange(e.target.value as OstNode['type'])}
          className={`${inputClass} min-h-11`}
        >
          {OST_NODE_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {t(OST_TYPE_META[ty].labelKey)}
              {ty === 'outcome' ? t('ost.rootSuffix') : ''}
            </option>
          ))}
        </select>
      </div>

      {requiredType && (
        <div>
          <label htmlFor="ost-parent" className="text-caption text-ink-muted">
            {t('ost.parentLabel', { type: t(OST_TYPE_META[requiredType].labelKey) })}
          </label>
          <select
            id="ost-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={`${inputClass} min-h-11`}
          >
            <option value="">{legalParents.length === 0 ? t('ost.noParents') : t('common.selectPlaceholder')}</option>
            {legalParents.map((n) => (
              <option key={n.id} value={n.id}>
                {truncate(n.title)}
              </option>
            ))}
          </select>
          {legalParents.length === 0 && (
            <p className="mt-1 text-caption text-warning">{t('ost.createParentHint', { type: t(OST_TYPE_META[requiredType].labelKey) })}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="ost-title" className="text-caption text-ink-muted">
          {t('ost.titleLabel')}
        </label>
        <input
          id="ost-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={t(
            type === 'outcome'
              ? 'ost.titlePlaceholder.outcome'
              : type === 'opportunity'
                ? 'ost.titlePlaceholder.opportunity'
                : type === 'solution'
                  ? 'ost.titlePlaceholder.solution'
                  : 'ost.titlePlaceholder.experiment',
          )}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="ost-assumption" className="text-caption text-ink-muted">
          {t('experiment.linkAssumption')}
        </label>
        <select
          id="ost-assumption"
          value={linkedAssumptionId ?? ''}
          onChange={(e) => setLinkedAssumptionId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">{t('experiment.linkNone')}</option>
          {assumptions.map((a) => (
            <option key={a.id} value={a.id}>
              {truncate(a.statement, 36)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="ost-experiment" className="text-caption text-ink-muted">
          {t('experiment.linkExperiment')}
        </label>
        <select
          id="ost-experiment"
          value={linkedExperimentId ?? ''}
          onChange={(e) => setLinkedExperimentId(e.target.value)}
          className={`${inputClass} min-h-11`}
        >
          <option value="">{t('experiment.linkNone')}</option>
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {truncate(e.hypothesis, 36)}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-caption text-ink-muted">
          {t('ost.positionLabel', { width: NODE_WIDTH * 10 })}
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
              aria-label={t('ost.xAria')}
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
              aria-label={t('ost.yAria')}
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
          {saving ? t('common.saving') : editing ? t('common.saveEdit') : t('ost.createNode')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  )
}
