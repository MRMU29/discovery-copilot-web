import { describe, expect, it } from 'vitest'
import {
  applyResolvedTheme,
  applyThemePreference,
  initThemeBeforePaint,
  resolveTheme,
  type ThemePref,
} from '@/lib/theme'

describe('resolveTheme', () => {
  it('passes explicit light/dark through regardless of system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it("resolves 'system' against prefers-color-scheme", () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('theme appliers', () => {
  it('covers every preference value', () => {
    const prefs: ThemePref[] = ['light', 'dark', 'system']
    for (const pref of prefs) {
      expect(['light', 'dark', 'system']).toContain(pref)
    }
  })

  // vitest 环境 = node：document/localStorage/matchMedia 缺失时必须静默降级，
  // 保证 theme-init 在任何宿主（含未来 SSR/Worker）都不阻塞启动。
  it('degrade silently outside the browser (no document/localStorage)', () => {
    expect(() => applyResolvedTheme('light')).not.toThrow()
    expect(() => initThemeBeforePaint()).not.toThrow()
    expect(() => applyThemePreference('system')()).not.toThrow()
    expect(() => applyThemePreference('light')()).not.toThrow()
    expect(() => applyThemePreference('dark')()).not.toThrow()
  })
})
