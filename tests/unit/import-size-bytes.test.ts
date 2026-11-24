import { describe, expect, it } from 'vitest'
import { parseDcopilotFile } from '@/services/backup'

/**
 * §5.4 caps imports at 20 MB. The check must count UTF-8 bytes, not UTF-16 code
 * units: 3 CJK characters are 9 bytes but only 3 "characters", so a length-based
 * check would let a ~60 MB Chinese file through.
 */
describe('import size gate counts bytes, not UTF-16 code units', () => {
  it('rejects a CJK payload whose byte size exceeds the byte budget', () => {
    const text = '中文备份' // 4 chars, 12 bytes
    expect(text.length).toBeLessThan(12)
    const result = parseDcopilotFile(text, { maxBytes: 11 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).toContain('上限')
  })

  it('accepts the same text when the byte budget is large enough', () => {
    const result = parseDcopilotFile('中文备份', { maxBytes: 12 })
    // Passes the size gate; fails later because it is not JSON.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]).not.toContain('上限')
  })
})
