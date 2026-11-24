/**
 * Line-level diff for AI report regeneration (§roadmap 5.2). Deliberately
 * dependency-free: the payload is a Markdown report (≤ a few thousand lines),
 * so an O(n·m) LCS is enough — with a hard cell budget so a pathological
 * 500k-character paste cannot freeze the tab.
 */

export interface DiffLine {
  type: 'same' | 'added' | 'removed'
  text: string
  /** 1-based line number in the old text; null for added lines. */
  leftNo: number | null
  /** 1-based line number in the new text; null for removed lines. */
  rightNo: number | null
}

/** 500 × 500 lines fits comfortably; beyond this we degrade to a block replace. */
const MAX_CELLS = 250_000

export function diffLines(before: string, after: string): { lines: DiffLine[]; truncated: boolean } {
  const a = before.split('\n')
  const b = after.split('\n')

  if (a.length * b.length > MAX_CELLS) {
    const lines: DiffLine[] = [
      ...a.map((text, index) => ({ type: 'removed' as const, text, leftNo: index + 1, rightNo: null })),
      ...b.map((text, index) => ({ type: 'added' as const, text, leftNo: null, rightNo: index + 1 })),
    ]
    return { lines, truncated: true }
  }

  // dp[i][j] = LCS length of a[i:] and b[j:]; Uint32Array keeps the table flat.
  const width = b.length + 1
  const dp = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)])
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', text: a[i], leftNo: i + 1, rightNo: j + 1 })
      i += 1
      j += 1
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      lines.push({ type: 'removed', text: a[i], leftNo: i + 1, rightNo: null })
      i += 1
    } else {
      lines.push({ type: 'added', text: b[j], leftNo: null, rightNo: j + 1 })
      j += 1
    }
  }
  while (i < a.length) {
    lines.push({ type: 'removed', text: a[i], leftNo: i + 1, rightNo: null })
    i += 1
  }
  while (j < b.length) {
    lines.push({ type: 'added', text: b[j], leftNo: null, rightNo: j + 1 })
    j += 1
  }
  return { lines, truncated: false }
}

export interface ContentSection {
  /** `## ` title without the marker; null for the preamble. */
  heading: string | null
  /** Raw lines of this section, heading included (so joining the bodies reproduces the text). */
  body: string
}

const HEADING = /^##\s+(.*)$/

/**
 * Splits a report on `## ` headings. The preamble is always item 0 (even when
 * empty) so `picks` indices stay aligned between old and new drafts.
 */
export function splitSections(content: string): ContentSection[] {
  const lines = content.split('\n')
  const sections: ContentSection[] = []
  let current: ContentSection = { heading: null, body: '' }
  const buffer: string[] = []

  const flush = () => {
    current = { heading: current.heading, body: buffer.join('\n') }
    sections.push(current)
    buffer.length = 0
  }

  for (const line of lines) {
    const match = HEADING.exec(line)
    if (match) {
      flush()
      current = { heading: match[1].trim(), body: '' }
      buffer.push(line)
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections
}

/**
 * Per-section merge: `picks[i]` chooses the new draft's section i (1:1 with
 * `splitSections(after)`). Old sections the new draft dropped are appended so
 * no content disappears silently.
 */
export function mergeSections(before: string, after: string, picks: boolean[]): string {
  const oldSections = splitSections(before)
  const newSections = splitSections(after)
  const usedOld = new Set<number>()
  const parts: string[] = []

  newSections.forEach((section, index) => {
    if (index === 0) {
      const source = picks[0] === false ? oldSections[0] : section
      if (source?.body) parts.push(source.body)
      return
    }
    if (picks[index] !== false) {
      parts.push(section.body)
      return
    }
    const oldIndex = oldSections.findIndex(
      (candidate, candidateIndex) => candidateIndex > 0 && candidate.heading === section.heading,
    )
    if (oldIndex >= 0) {
      usedOld.add(oldIndex)
      parts.push(oldSections[oldIndex].body)
    } else {
      // Nothing to fall back to — dropping the section would lose content.
      parts.push(section.body)
    }
  })

  oldSections.forEach((section, index) => {
    if (index === 0 || usedOld.has(index)) return
    if (newSections.some((candidate) => candidate.heading === section.heading)) return
    parts.push(section.body)
  })

  return `${parts.filter((part) => part !== '').join('\n').replace(/\n+$/, '')}\n`
}
