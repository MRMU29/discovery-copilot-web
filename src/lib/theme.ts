/**
 * Theme preference (settings.theme) → `data-theme` on <html>.
 *
 * Three preferences: 'light' | 'dark' | 'system'. 'system' resolves against
 * prefers-color-scheme at apply time and re-applies when the OS flips. The
 * IndexedDB settings row is the source of truth; the resolved value is
 * mirrored to localStorage so the next load can apply it synchronously in
 * theme-init.ts before any CSS-aware paint (no flash of the wrong theme).
 */

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'dcopilot.theme'

const META_THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#010102',
  light: '#ffffff',
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light'
  return pref
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META_THEME_COLOR[resolved])
}

/** Pre-paint hook (theme-init.ts): cached resolution, else system, else dark. */
export function initThemeBeforePaint(): void {
  if (typeof document === 'undefined') return
  let cached: ResolvedTheme | null = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    cached = raw === 'light' || raw === 'dark' ? raw : null
  } catch {
    // private mode / storage disabled — fall through to system preference
  }
  applyResolvedTheme(cached ?? resolveTheme('system', systemPrefersDark()))
}

/**
 * Apply a preference and keep it in sync. Returns a cleanup that removes the
 * system-change listener ('system' preference only). Idempotent per pref.
 */
export function applyThemePreference(pref: ThemePref): () => void {
  applyResolvedTheme(resolveTheme(pref, systemPrefersDark()))
  try {
    localStorage.setItem(STORAGE_KEY, resolveTheme(pref, systemPrefersDark()))
  } catch {
    // best-effort mirror only — settings row stays authoritative
  }
  if (pref !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => applyResolvedTheme(resolveTheme('system', mql.matches))
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * Resolved theme for UI affordances (e.g. the light/dark toggle icon):
 * tracks the preference, and the OS flip while the preference is 'system'.
 * Modeled as an external store subscription (no effect-driven setState).
 */
export function useResolvedTheme(pref: ThemePref): ResolvedTheme {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (pref !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined
      }
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [pref],
  )
  const getSnapshot = useCallback(() => resolveTheme(pref, systemPrefersDark()), [pref])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
