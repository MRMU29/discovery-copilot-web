/**
 * Reference-counted `inert` for stacked dialogs (§v0.2.4 focus work).
 *
 * The old Dialog set `inert` on open and *unconditionally* removed it on close,
 * so closing an inner dialog while an outer one was still mounted re-enabled
 * the background. Counting keeps the attribute until the last dialog closes.
 * Kept as a pure factory so the ordering (including React StrictMode's
 * mount → cleanup → mount cycle) is unit-testable without a DOM.
 */
export interface InertCounter {
  acquire(): void
  release(): void
  readonly active: number
}

export function createInertCounter(apply: (active: boolean) => void): InertCounter {
  let count = 0
  return {
    acquire(): void {
      count += 1
      if (count === 1) apply(true)
    },
    release(): void {
      if (count === 0) return
      count -= 1
      if (count === 0) apply(false)
    },
    get active(): number {
      return count
    },
  }
}
