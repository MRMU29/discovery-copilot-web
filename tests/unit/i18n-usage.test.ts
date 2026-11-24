import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zhHans } from '@/lib/i18n/dictionaries/zh-Hans'

/**
 * Key-set parity between the 8 dictionaries is covered by i18n.test.ts. This
 * test covers the other direction: every literal key the code asks for must
 * actually exist, otherwise the UI renders the raw key (that is how
 * `common.saving2` shipped). Dynamic keys (`t(someVar)`, template literals) are
 * out of scope — only single-quoted literals are verified.
 */
const SRC = join(process.cwd(), 'src')
const KEYS = new Set(Object.keys(zhHans))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? dir, entry.name))
}

describe('i18n: every literal key used in src exists in the dictionary', () => {
  it('has no missing keys', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\b(?:t|translate)\(\s*'([^'\\]+)'/g)) {
        const key = match[1]
        if (!KEYS.has(key)) missing.push(`${file.replace(process.cwd(), '.')}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
