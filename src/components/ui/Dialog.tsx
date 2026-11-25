import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { createInertCounter } from '@/lib/focus'
import { useT } from '@/lib/i18n'

interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  /** 'lg' widens the panel for long-form content (Relay prompt reading). */
  size?: 'md' | 'lg'
  /** Optional first target (command palette search box); falls back to the first focusable. */
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Shared across every Dialog instance so nested modals keep the app inert. */
const inertCounter = createInertCounter((active) => {
  const appRoot = document.getElementById('root')
  if (active) appRoot?.setAttribute('inert', '')
  else appRoot?.removeAttribute('inert')
})

/**
 * Minimal modal (no Radix by decision): Esc + backdrop click to close,
 * bottom sheet on mobile / centered card from sm up.
 *
 * Rendered through a portal into <body> so `position: fixed` is always
 * viewport-relative — an animated ancestor with a transform would otherwise
 * become the containing block and push the sheet to the end of the document.
 * While open the app root is `inert` and Tab cycles inside the panel; on close
 * focus returns to whatever opened the dialog (§audit P2-7 / WCAG 2.4.3).
 * On narrow screens the panel is bounded to the viewport, the close button is
 * a 44px target, and the body scrolls internally with Home-Indicator room.
 */
export function Dialog({ open, title, onClose, size = 'md', initialFocus, children }: DialogProps) {
  const t = useT()
  const panelRef = useRef<HTMLDivElement>(null)
  // Keep the latest callback without re-running the focus effect on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Counted: closing an inner dialog must not un-inert the app behind an outer one.
    inertCounter.acquire()

    const items = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null,
      )

    ;(initialFocus?.current ?? items()[0])?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        event.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (!panel?.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      inertCounter.release()
      previouslyFocused?.focus?.()
    }
    // Callers must pass a stable ref (useRef), so this only re-runs with `open`.
  }, [open, initialFocus])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/55 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dc-safe-bottom flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg border border-hairline bg-surface-1 shadow-modal sm:rounded-lg ${
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
        }`}
      >
        <header className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 flex-1 text-subhead text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex size-11 shrink-0 items-center justify-center rounded-btn text-xl leading-none text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
