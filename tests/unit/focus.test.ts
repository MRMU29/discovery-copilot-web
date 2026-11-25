import { describe, expect, it } from 'vitest'
import { createInertCounter } from '@/lib/focus'

function tracker() {
  const calls: boolean[] = []
  const counter = createInertCounter((active) => calls.push(active))
  return { calls, counter }
}

describe('createInertCounter', () => {
  it('applies inert only for the first acquire and removes it for the last release', () => {
    const { calls, counter } = tracker()
    counter.acquire()
    counter.acquire()
    expect(counter.active).toBe(2)
    expect(calls).toEqual([true])

    counter.release()
    expect(counter.active).toBe(1)
    expect(calls).toEqual([true]) // still inert: an outer dialog is open

    counter.release()
    expect(counter.active).toBe(0)
    expect(calls).toEqual([true, false])
  })

  it('survives React StrictMode mount → cleanup → mount', () => {
    const { calls, counter } = tracker()
    counter.acquire()
    counter.release()
    counter.acquire()
    expect(counter.active).toBe(1)
    expect(calls).toEqual([true, false, true])
  })

  it('never goes negative when a cleanup runs twice', () => {
    const { calls, counter } = tracker()
    counter.acquire()
    counter.release()
    counter.release()
    expect(counter.active).toBe(0)
    expect(calls).toEqual([true, false])
  })
})
