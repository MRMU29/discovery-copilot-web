import { useState } from 'react'
import { HelpCircleIcon } from '@/components/ui/icons'

interface FieldHintProps {
  /** 字段名，用于无障碍标签。 */
  field: string
  good: string
  bad: string
  /**
   * true = 引导未读，默认展开并带「知道了，不再提示」；
   * false = 已读，仅保留问号，点击仍可查看（不打扰状态）。
   */
  highlighted?: boolean
  /** 用户点「知道了」后回调（调用方 markOnboardingDone('fieldHints')）。 */
  onRead?: () => void
}

/**
 * 字段级填写引导（新手指引第二层）：问号展开好/坏例子对比。首次出现默认
 * 展开，读完或提交成功后折叠为纯问号——任何状态下都不阻断填写。
 */
export function FieldHint({ field, good, bad, highlighted = false, onRead }: FieldHintProps) {
  const [expanded, setExpanded] = useState(highlighted)

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label={`查看「${field}」的填写示例`}
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface-2 hover:text-ink"
      >
        <HelpCircleIcon size={14} />
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-3 text-caption">
      <div className="flex items-center gap-1.5 text-ink-secondary">
        <HelpCircleIcon size={14} />
        <span className="font-medium">{field} · 这样填更好</span>
        <button
          type="button"
          aria-label={`收起「${field}」示例`}
          onClick={() => setExpanded(false)}
          className="ml-auto min-h-6 rounded-btn px-2 text-caption text-ink-faint hover:text-ink"
        >
          收起
        </button>
      </div>
      <p className="mt-1.5 text-success">
        <span className="font-medium">好例子：</span>
        {good}
      </p>
      <p className="mt-1 text-danger">
        <span className="font-medium">坏例子：</span>
        {bad}
      </p>
      {highlighted && (
        <button
          type="button"
          onClick={() => {
            setExpanded(false)
            onRead?.()
          }}
          className="mt-2 min-h-8 rounded-btn bg-surface-3 px-3 text-caption text-ink hover:bg-surface-4"
        >
          知道了，不再提示
        </button>
      )}
    </div>
  )
}
