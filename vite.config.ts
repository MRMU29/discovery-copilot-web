import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  // GitHub Pages project site serves under /discovery-copilot-web/ — the
  // deploy workflow sets PAGES_BASE_PATH; local dev/preview stays at '/'.
  base: process.env.PAGES_BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      // CSP meta tag for hosts that cannot set response headers (GH Pages).
      // Build-only: dev needs inline react-refresh scripts and an HMR socket.
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml(html) {
        const csp =
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src *; base-uri 'self'; form-action 'self'"
        return html.replace('</head>', `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`)
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // §9.2: schemas/db/ai line coverage must not drop below 80% (command 11 gate).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/schemas/**', 'src/db/**', 'src/ai/**'],
      thresholds: { lines: 80 },
    },
  },
})
