import { AIError, classifyAIError } from '../errors'

/**
 * Shared JSON-over-HTTP plumbing for adapters: status→error mapping, timeout
 * + user signal composition, and JSON extraction with code-fence stripping.
 * Adapters inject `fetchImpl` so the whole layer is testable without network.
 */

export interface JsonRequestInit {
  url: string
  headers: Record<string, string>
  /** Omit for GET. */
  body?: unknown
  signal?: AbortSignal
  timeoutMs: number
  fetchImpl?: typeof fetch
}

/**
 * Compose timeout + caller signal without `AbortSignal.any` / `AbortSignal.timeout`
 * (Safari only shipped those in 16.4 / 17.4; README promises 16+ best effort, and
 * a missing API surfaced as a TypeError that was misclassified as NETWORK).
 * Returns a disposer so the timer and listener never outlive the request.
 */
function composeAbort(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const onTimeout = () => controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))
  const timer = setTimeout(onTimeout, timeoutMs)
  const onExternalAbort = () => controller.abort(external?.reason)
  if (external) {
    if (external.aborted) onExternalAbort()
    else external.addEventListener('abort', onExternalAbort, { once: true })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  }
}

export async function requestJson<T>(init: JsonRequestInit): Promise<{ status: number; data: T }> {
  const fetchImpl = init.fetchImpl ?? globalThis.fetch
  const { signal, dispose } = composeAbort(init.timeoutMs, init.signal)
  let response: Response
  try {
    response = await fetchImpl(init.url, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: init.body === undefined ? init.headers : { ...init.headers, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    })
  } catch (err) {
    dispose()
    throw classifyAIError(err)
  }
  if (!response.ok) {
    // Error bodies come from an external (possibly hostile) endpoint and may echo
    // the request URL/Authorization. Keep only the status code, never the body.
    dispose()
    throw classifyAIError(new Error(`HTTP ${response.status}`), response.status)
  }
  try {
    return { status: response.status, data: (await response.json()) as T }
  } catch {
    throw new AIError('PARSE', '响应不是有效 JSON')
  } finally {
    dispose()
  }
}

/** Best-effort JSON extraction: strips ```json fences, then slices outer braces. */
export function extractJson(raw: string): unknown {
  const stripped = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1))
    }
    throw new Error('no JSON object found in response')
  }
}
