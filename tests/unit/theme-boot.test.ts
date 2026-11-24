import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { THEME_META_COLOR, THEME_STORAGE_KEY } from '@/lib/theme'

/**
 * public/theme-init.js runs before any module, so it cannot import the constants.
 * This test is the guard against the two copies drifting apart (a wrong storage
 * key would silently reintroduce the dark-mode flash).
 */
const BOOT = readFileSync(join(process.cwd(), 'public/theme-init.js'), 'utf8')

describe('pre-paint theme script stays in sync with src/lib/theme.ts', () => {
  it('uses the same storage key', () => {
    expect(BOOT).toContain(`'${THEME_STORAGE_KEY}'`)
  })

  it.each([THEME_META_COLOR.dark, THEME_META_COLOR.light])('uses the same palette value %s', (color) => {
    expect(BOOT.toLowerCase()).toContain(color.toLowerCase())
  })

  it('sets data-theme and is served as a classic script from index.html', () => {
    expect(BOOT).toContain('document.documentElement.dataset.theme')
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toMatch(/<script src="%BASE_URL%theme-init\.js"><\/script>/)
  })
})
