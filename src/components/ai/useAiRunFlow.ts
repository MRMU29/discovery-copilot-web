import { useEffect, useRef, useState } from 'react'
import { AIError } from '@/ai'
import { useT } from '@/lib/i18n'

export interface AiEstimate {
  inputTokens: number
  usd: number | null
}

export interface RunOptions<T> {
  /** 请求前预估；null 表示这次不显示预估行。 */
  estimate?: AiEstimate | null
  execute: (signal: AbortSignal) => Promise<T>
  onSuccess: (value: T) => void
  /** 失败（含取消 / 预算熔断）时的额外清理，例如丢弃半成品草稿。 */
  onError?: (error: unknown) => void
}

export interface AiRunFlow {
  /** 请求进行中（三个对话框的「生成中」阶段）。 */
  busy: boolean
  error: string | null
  budgetError: string | null
  estimate: AiEstimate | null
  /** 发起一次请求；异常按 ABORTED / BUDGET / 其他三档落到 error 或 budgetError。 */
  run: <T>(options: RunOptions<T>) => Promise<void>
  /** 取消进行中的请求（组件卸载时也会自动取消）。 */
  cancel: () => void
  setError: (message: string | null) => void
}

/**
 * 三个 AI 审核对话框共用的运行状态机：
 * - 只拥有「运行中 / 错误 / 预算熔断 / 预估值」，不关心各自的预览数据结构；
 * - 卸载即 abort，避免关闭对话框后请求继续跑；
 * - 错误分类只有这一处：ABORTED → 已取消，BUDGET → 预算确认块，其余 → 通用错误。
 */
export function useAiRunFlow(): AiRunFlow {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<AiEstimate | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  async function run<T>({
    estimate: nextEstimate = null,
    execute,
    onSuccess,
    onError,
  }: RunOptions<T>): Promise<void> {
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setBudgetError(null)
    setEstimate(nextEstimate)
    try {
      onSuccess(await execute(controller.signal))
    } catch (err) {
      onError?.(err)
      if (err instanceof AIError && err.code === 'ABORTED') {
        setError(t('ai.dialog.cancelled'))
      } else if (err instanceof AIError && err.code === 'BUDGET') {
        setBudgetError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  function cancel() {
    abortRef.current?.abort()
  }

  return { busy, error, budgetError, estimate, run, cancel, setError }
}
