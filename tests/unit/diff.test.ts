import { describe, expect, it } from 'vitest'
import { diffLines, mergeSections, splitSections } from '@/lib/diff'

describe('diffLines', () => {
  it('marks identical text as unchanged with aligned line numbers', () => {
    const { lines, truncated } = diffLines('a\nb', 'a\nb')
    expect(truncated).toBe(false)
    expect(lines.every((line) => line.type === 'same')).toBe(true)
    expect(lines.map((line) => [line.leftNo, line.rightNo])).toEqual([
      [1, 1],
      [2, 2],
    ])
  })

  it('detects insertions, deletions and replacements', () => {
    const { lines } = diffLines('keep\nold\nkeep2', 'keep\nnew\nkeep2\nextra')
    expect(lines.filter((line) => line.type === 'same').map((line) => line.text)).toEqual([
      'keep',
      'keep2',
    ])
    expect(lines.some((line) => line.type === 'removed' && line.text === 'old')).toBe(true)
    expect(lines.some((line) => line.type === 'added' && line.text === 'new')).toBe(true)
    expect(lines.at(-1)).toMatchObject({ type: 'added', text: 'extra', leftNo: null, rightNo: 4 })
  })

  it('keeps empty lines instead of swallowing them', () => {
    const { lines } = diffLines('a\n\nb', 'a\nb')
    expect(lines.filter((line) => line.type === 'removed')).toHaveLength(1)
    expect(lines.find((line) => line.type === 'removed')?.text).toBe('')
  })

  it('degrades to a block replace beyond the cell budget', () => {
    const before = Array.from({ length: 600 }, (_, i) => `old ${i}`).join('\n')
    const after = Array.from({ length: 600 }, (_, i) => `new ${i}`).join('\n')
    const { lines, truncated } = diffLines(before, after)
    expect(truncated).toBe(true)
    expect(lines.filter((line) => line.type === 'removed')).toHaveLength(600)
    expect(lines.filter((line) => line.type === 'added')).toHaveLength(600)
  })
})

describe('splitSections', () => {
  it('returns a single preamble when there is no h2', () => {
    const sections = splitSections('just text\nmore')
    expect(sections).toHaveLength(1)
    expect(sections[0].heading).toBeNull()
    expect(sections[0].body).toBe('just text\nmore')
  })

  it('splits on h2 headings and keeps the marker in the body', () => {
    const sections = splitSections('intro\n## 背景\nbody A\n## 结论\nbody B')
    expect(sections.map((section) => section.heading)).toEqual([null, '背景', '结论'])
    expect(sections[1].body).toBe('## 背景\nbody A')
    expect(sections[2].body).toBe('## 结论\nbody B')
  })
})

describe('mergeSections', () => {
  const before = ['intro old', '## A', 'old A', '## B', 'old B'].join('\n')
  const after = ['intro new', '## A', 'new A', '## C', 'new C'].join('\n')

  it('takes the picked version of each section and appends old-only sections', () => {
    const merged = mergeSections(before, after, [true, true, false])
    expect(merged).toContain('intro new')
    expect(merged).toContain('new A')
    expect(merged).toContain('new C') // no old "C" to fall back to
    expect(merged).toContain('old B') // dropped by the new draft, kept
    expect(merged.endsWith('\n')).toBe(true)
  })

  it('falls back to the old section with the same heading', () => {
    const merged = mergeSections(before, after, [true, false, true])
    expect(merged).toContain('old A')
    expect(merged).not.toContain('new A')
  })

  it('still preserves old-only sections when every new section is picked', () => {
    // "Merge" is not "replace": sections the new draft dropped come back at the
    // end. The explicit "keep new" action is the way to discard them.
    const merged = mergeSections(before, after, [true, true, true])
    expect(merged).toBe(`${after}\n## B\nold B\n`)
  })
})
