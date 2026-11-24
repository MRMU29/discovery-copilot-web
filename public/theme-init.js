/*
 * Pre-paint theme resolution.
 *
 * Loaded as a classic (blocking) same-origin script from <head> so it runs before
 * the first paint. `script-src 'self'` forbids inline scripts, and the ES-module
 * bootstrap in src/main.tsx is deferred — which is exactly why a dark-theme user
 * used to see a light flash. Keep the storage key and both palette values in sync
 * with src/lib/theme.ts (tests/unit/theme-boot.test.ts asserts they match).
 */
;(function () {
  var KEY = 'dcopilot.theme'
  var META = { dark: '#11121f', light: '#f6fbfd' }
  var cached = null
  try {
    var raw = localStorage.getItem(KEY)
    if (raw === 'light' || raw === 'dark') cached = raw
  } catch (e) {
    /* private mode / storage disabled — fall back to the OS preference */
  }
  var dark = cached
    ? cached === 'dark'
    : typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  var resolved = dark ? 'dark' : 'light'
  document.documentElement.dataset.theme = resolved
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META[resolved])
})()
