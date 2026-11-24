import { describe, expect, it } from 'vitest'
import { safeStashTarget } from '@/lib/deep-link'

describe('deep-link restore only accepts same-origin absolute paths', () => {
  it('accepts a normal path', () => {
    expect(safeStashTarget('/project/abc/assumptions?view=table')).toBe('/project/abc/assumptions?view=table')
    expect(safeStashTarget('/')).toBe('/')
  })

  const rejected: Array<string | null> = [
    '//evil.example/x',
    '/\\evil.example',
    'https://evil.example/x',
    'javascript:alert(1)',
    'project/abc',
    '',
    null,
  ]

  it('rejects non-same-origin targets', () => {
    for (const raw of rejected) expect(safeStashTarget(raw), String(raw)).toBeNull()
  })
})
