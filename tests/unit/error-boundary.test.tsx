// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// React 18 requires this flag for act() outside a test renderer.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Boom(): never {
  throw new Error('boom-marker')
}

/** §audit P1-4: a render-time throw must not leave a blank page. */
describe('ErrorBoundary', () => {
  it('renders a recoverable fallback instead of an empty screen', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const originalError = console.error
    // React re-reports a caught render error through window.onerror in React 18;
    // swallow it so jsdom's virtual console does not flag the suite as failing.
    const originalOnError = window.onerror
    window.onerror = () => true
    console.error = () => undefined
    try {
      await act(async () => {
        root.render(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>,
        )
      })
    } finally {
      console.error = originalError
      window.onerror = originalOnError
    }
    expect(host.textContent).toContain('出错了')
    expect(host.textContent).toContain('boom-marker')
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.querySelector('button')?.textContent).toContain('重新加载')
    await act(async () => root.unmount())
    host.remove()
  })
})
