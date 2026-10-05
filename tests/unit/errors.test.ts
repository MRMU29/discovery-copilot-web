import { describe, expect, it } from 'vitest'
import { AIError, classifyAIError, userMessage } from '@/ai/errors'

function abortWithReason(name: string): DOMException {
  const err = new DOMException('aborted', 'AbortError')
  Object.assign(err, { reason: new DOMException('timeout', name) })
  return err
}

describe('AI error taxonomy (§6.2)', () => {
  it('maps 401/403 to UNAUTHORIZED with the status attached', () => {
    for (const status of [401, 403]) {
      const err = classifyAIError(new Error('nope'), status)
      expect(err.code).toBe('UNAUTHORIZED')
      expect(err.status).toBe(status)
    }
  })

  it('maps 429 to RATE_LIMITED', () => {
    expect(classifyAIError(new Error('slow down'), 429).code).toBe('RATE_LIMITED')
  })

  it('maps plain AbortError to ABORTED (user cancel)', () => {
    expect(classifyAIError(new DOMException('x', 'AbortError')).code).toBe('ABORTED')
  })

  it('maps AbortError carrying a TimeoutError reason to TIMEOUT', () => {
    expect(classifyAIError(abortWithReason('TimeoutError')).code).toBe('TIMEOUT')
  })

  it('maps fetch TypeError (network/CORS) to NETWORK with proxy guidance', () => {
    const err = classifyAIError(new TypeError('Failed to fetch'))
    expect(err.code).toBe('NETWORK')
    expect(err.message).toContain('兼容代理')
  })

  it('passes AIError through untouched', () => {
    const original = new AIError('BUDGET', '熔断')
    expect(classifyAIError(original)).toBe(original)
  })

  it('falls back to UNKNOWN and always exposes a readable Chinese message', () => {
    expect(classifyAIError(new Error('boom')).code).toBe('UNKNOWN')
    for (const code of ['NOT_CONFIGURED', 'UNAUTHORIZED', 'RATE_LIMITED', 'TIMEOUT', 'NETWORK', 'PARSE', 'ABORTED', 'BUDGET', 'UNKNOWN'] as const) {
      expect(userMessage(code).length).toBeGreaterThan(4)
    }
  })
})
