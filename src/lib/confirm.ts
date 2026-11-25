/**
 * 命令式确认框（替代 `window.confirm`）：调用点拿 Promise<boolean>，渲染交给
 * 全局唯一的 `<ConfirmHost />`。
 *
 * 为什么不直接做成 hook：`endpoint-guard.ts` 这类非 React 模块也要确认，
 * 而 `window.confirm` 的毛病恰恰是「不可本地化、不可测、不能给危险动作配色」。
 *
 * 没有挂载 host 时（单元测试直接渲染页面组件）回退到 `window.confirm`，
 * 保证行为不静默失效。
 */

export type ConfirmTone = 'default' | 'danger'

export interface ConfirmOptions {
  title: string
  /** 具体后果说明；留空则只有标题。 */
  body?: string
  /** 默认为 i18n `common.confirm` / `common.cancel`。 */
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

let pending: PendingConfirm | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** 订阅待确认项变化；返回取消订阅函数。 */
export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 当前待确认项（host 初次挂载时同步用）。 */
export function getPendingConfirm(): PendingConfirm | null {
  return pending
}

/** 结束当前确认；`ok` 即调用方收到的结果。重复调用无副作用。 */
export function settleConfirm(ok: boolean): void {
  const current = pending
  pending = null
  notify()
  current?.resolve(ok)
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (listeners.size === 0) {
    const text = options.body ? `${options.title}\n\n${options.body}` : options.title
    return Promise.resolve(window.confirm(text))
  }
  // 上一次没被处理就被新的确认顶掉：旧的按取消处理，避免 Promise 悬挂。
  pending?.resolve(false)
  return new Promise<boolean>((resolve) => {
    pending = { ...options, resolve }
    notify()
  })
}
