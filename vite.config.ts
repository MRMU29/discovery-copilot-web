import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  base: process.env.PAGES_BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    {
      // CSP meta tag for hosts where response headers cannot be set.
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
  build: {
    rollupOptions: {
      output: {
        /**
         * Vendor chunks (§6.1): the hash-named "jsx-runtime" blob used to carry
         * React + Dexie + Zod + Router, so any app change invalidated all of it.
         * Splitting by library keeps long-term caching across releases.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react-router')) return 'vendor-router'
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('/dexie')) return 'vendor-dexie'
          if (/node_modules[\\/]zod[\\/]/.test(id)) return 'vendor-zod'
          if (id.includes('recharts') || id.includes('victory-vendor') || /node_modules[\\/]d3-/.test(id)) {
            return 'vendor-charts'
          }
          return 'vendor'
        },
      },
    },
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
      // §7.5 / v0.3 §8: services are the highest-risk layer (import pipeline,
      // transactions), so they join the coverage gate. Per-glob thresholds keep the
      // original stricter bar where it already holds.
      include: ['src/schemas/**', 'src/db/**', 'src/ai/**', 'src/services/**'],
      thresholds: {
        lines: 70,
        'src/schemas/**': { lines: 80 },
        'src/db/**': { lines: 80 },
        'src/ai/**': { lines: 80 },
      },
    },
  },
})
