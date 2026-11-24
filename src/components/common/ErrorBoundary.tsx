import { Component, type ErrorInfo, type ReactNode } from 'react'
import { translate } from '@/lib/i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * App-level error boundary (§audit P1-4): without one, any render-time throw
 * (a corrupt row surfacing through a page, a bad lazy chunk) leaves a blank
 * screen with no way out. The fallback keeps the data intact — nothing here
 * touches IndexedDB — and offers a reload. Class component because React only
 * exposes `componentDidCatch` to classes; the copy goes through `translate()`
 * since hooks are unavailable here.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry by design: surface it in the console so a user can copy it
    // into an issue, nothing is sent anywhere.
    console.error('[dc] render error', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
        <div
          role="alert"
          className="w-full max-w-lg rounded-lg border border-danger/25 bg-surface-1 px-5 py-6 shadow-card sm:px-6 sm:py-8"
        >
          <h1 className="text-card-title text-ink">{translate('common.errorTitle')}</h1>
          <p className="mt-2 text-body-sm text-ink-muted">{translate('error.boundaryHint')}</p>
          <p className="mt-3 overflow-wrap-anywhere rounded-md bg-surface-2 px-3 py-2 font-mono text-caption text-ink-secondary">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 min-h-11 rounded-btn bg-accent px-4 py-2.5 text-button text-white shadow-xs hover:bg-accent-hover"
          >
            {translate('error.boundaryReload')}
          </button>
        </div>
      </div>
    )
  }
}
