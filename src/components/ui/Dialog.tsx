import { useEffect, type ReactNode } from 'react'
import { useT } from '@/lib/i18n'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  /** 'lg' widens the panel for long-form content (Relay prompt reading). */
  size?: 'md' | 'lg'
  children: ReactNode
}

/**
 * Minimal modal (no Radix by decision): Esc + backdrop click to close,
 * bottom sheet on mobile / centered card from sm up. Focus stays free-form —
 * full focus trapping arrives with a real headless-UI dependency if ever needed.
 */
export function Dialog({ open, title, onClose, size = 'md', children }: DialogProps) {
  const t = useT()
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-hairline bg-surface-1 sm:rounded-lg ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-subhead text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex size-9 items-center justify-center rounded-btn text-xl leading-none text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
