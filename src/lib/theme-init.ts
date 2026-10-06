import { initThemeBeforePaint } from './theme'

// Imported BEFORE tokens.css in main.tsx so <html data-theme> is already set
// when any stylesheet applies — the first paint uses the right palette.
initThemeBeforePaint()
