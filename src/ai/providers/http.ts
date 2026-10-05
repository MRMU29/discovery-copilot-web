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

export async function requestJson<T>(init: JsonRequestInit): Promise<{ status: number; data: T }> {
  const fetchImpl = init.fetchImpl ?? globalThis.fetch
  const timeout = AbortSignal.timeout(init.timeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetchImpl(init.url, {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: init.body === undefined ? init.headers : { ...init.headers, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    })
  } catch (err) {
    throw classifyAIError(err)
  }
  if (!response.ok) {
    const status = response.status
    const detail = await response.text().catch(() => '')
    throw classifyAIError(new Error(detail.slice(0, 300) || `HTTP ${status}`), status)
  }
  try {
    return { status: response.status, data: (await response.json()) as T }
  } catch {
    throw new AIError('PARSE', '响应不是有效 JSON')
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
