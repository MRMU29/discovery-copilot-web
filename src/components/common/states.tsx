/** Async-state primitives: loading / empty / error — every panel ships all three (plan §8.3). */
import { useT } from '@/lib/i18n'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-3 ${className}`} aria-hidden="true" />
}

export function PageSkeleton() {
  const t = useT()
  return (
    <div className="space-y-4" role="status" aria-label={t('common.loading')}>
      <Skeleton className="h-8 w-56" />
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
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline bg-surface-1 px-6 py-12 text-center">
      <p className="text-card-title text-ink">{title}</p>
      {description && <p className="max-w-md text-body-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
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
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-danger/40 bg-surface-1 px-6 py-12 text-center"
    >
      <p className="text-card-title text-ink">{heading}</p>
      <p className="max-w-md text-body-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded-btn bg-accent px-4 py-2.5 text-button text-white"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}
