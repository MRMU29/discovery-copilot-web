import { Button } from '@/components/ui/Button'

interface AIReviewActionsProps {
  /** 已勾选条数。 */
  count: number
  /** 建议总条数。 */
  total: number
  onToggleAll: (next: boolean) => void
  applying: boolean
  regenerating: boolean
  /** 动词宾语（「假设」/「实验」），用于无障碍描述。 */
  applyLabel: string
  /** 覆盖默认的「应用选中的 N 条」按钮文案（单件场景如整份报告）。 */
  applyText?: string
  /** false = 隐藏全选行（单件场景没有批量勾选）。 */
  selectable?: boolean
  onApply: () => void
  onReject: () => void
  onRegenerate: () => void
  onBack: () => void
  backLabel: string
}
/**
 * 审核式工作流动作条（§8.3 六态的「应用/拒绝/重新生成」三态 + 批量勾选），
 * 由 AI 识别、AI 实验与 AI 报告对话框共享，保证审核交互一致。
 */
export function AIReviewActions({
  count,
  total,
  onToggleAll,
  applying,
  regenerating,
  applyLabel,
  applyText,
  selectable = true,
  onApply,
  onReject,
  onRegenerate,
  onBack,
  backLabel,
}: AIReviewActionsProps) {
  const allChecked = total > 0 && count === total
  return (
    <div className="space-y-3">
      {selectable && (
        <label className="flex min-h-9 items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => onToggleAll(e.target.checked)}
            className="size-4 accent-accent"
            aria-label={`全选${applyLabel}`}
          />
          {allChecked ? '全不选' : '全选'}（已选 {count}/{total}）
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={onApply}
          disabled={applying || count === 0}
          aria-label={applyText ?? `应用选中的 ${count} 条${applyLabel}`}
        >
          {applyText ?? (applying ? '应用中…' : `应用选中的 ${count} 条${applyLabel ? `（${applyLabel}）` : ''}`)}
        </Button>
        <Button variant="ghost" onClick={onRegenerate} disabled={regenerating || applying}>
          {regenerating ? '重新生成中…' : '重新生成'}
        </Button>
        <Button variant="ghost" onClick={onReject} disabled={applying || regenerating}>
          拒绝全部
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={applying || regenerating}>
          {backLabel}
        </Button>
      </div>
    </div>
  )
}
