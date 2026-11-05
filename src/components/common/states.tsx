/** Async-state primitives: loading / empty / error — every panel ships all three (plan §8.3). */
import { useT } from '@/lib/i18n'
import { CompassIcon } from '@/components/ui/icons'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-4 ${className}`} aria-hidden="true" />
}

export function PageSkeleton() {
  const t = useT()
  return (
    <div className="space-y-4" role="status" aria-label={t('common.loading')}>
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-hairline bg-surface-1 px-4 py-10 text-center shadow-card sm:px-6 sm:py-14">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <CompassIcon size={24} />
      </span>
      <p className="mt-1 text-subhead text-ink sm:text-card-title">{title}</p>
      {description && <p className="max-w-md text-body-sm text-ink-muted sm:text-body">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  const t = useT()
  const heading = title ?? t('common.errorTitle')
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/25 bg-tint-orange px-4 py-9 text-center sm:px-6 sm:py-12"
    >
      <p className="text-subhead text-ink sm:text-card-title">{heading}</p>
      <p className="max-w-md text-body-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded-btn bg-accent px-4 py-2.5 text-button text-white shadow-xs hover:bg-accent-hover"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
