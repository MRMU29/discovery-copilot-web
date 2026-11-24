// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { setLocale, useT } from '@/lib/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Label() {
  const t = useT()
  return <span>{t('settings.appearance.title')}</span>
}

/**
 * Regression: dictionaries load lazily, so `setLocale('en')` first flips the locale
 * (one notify) and later the chunk arrives (a second notify). The external store
 * snapshot must change for the second one to re-render — otherwise every component
 * keeps the zh-Hans fallback forever.
 */
describe('useT re-renders when the dictionary chunk arrives', () => {
  it('switches rendered text after an async locale load', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<Label />)
    })
    const chinese = host.textContent

    await act(async () => {
      await setLocale('en')
    })
    const english = host.textContent
    expect(english).not.toBe(chinese)
    expect(english).toBe('Appearance')

    await act(async () => {
      await setLocale('zh-Hans')
    })
    expect(host.textContent).toBe(chinese)

    await act(async () => root.unmount())
    host.remove()
  })
})
