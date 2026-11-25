import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { useT } from '@/lib/i18n'
import { getPendingConfirm, settleConfirm, subscribeConfirm, type PendingConfirm } from '@/lib/confirm'

/**
 * 全应用唯一的确认框挂载点。`confirmAction()` 把待确认项放进模块级 store，
 * 这里订阅并渲染；关闭（Esc / 背景点击 / 关闭按钮）一律按「取消」结算。
 *
 * 危险动作默认聚焦「取消」：误按 Enter 不该把数据删掉。
 */
export function ConfirmHost() {
  const t = useT()
  const [current, setCurrent] = useState<PendingConfirm | null>(() => getPendingConfirm())
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => subscribeConfirm(() => setCurrent(getPendingConfirm())), [])

  return (
    <Dialog open={current !== null} title={current?.title ?? ''} onClose={() => settleConfirm(false)} initialFocus={cancelRef}>
      {current && (
        <div className="space-y-4">
          {current.body && (
            <p className="whitespace-pre-line text-body-sm text-ink-secondary">{current.body}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="secondary" onClick={() => settleConfirm(false)}>
              {current.cancelLabel ?? t('common.cancel')}
            </Button>
            <Button
              variant={current.tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => settleConfirm(true)}
            >
              {current.confirmLabel ?? t('common.confirm')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
