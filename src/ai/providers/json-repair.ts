import { z } from 'zod'
import { AIError } from '../errors'
import type { ChatMessage, GenerateJSONResult, Usage } from '../types'
import { extractJson } from './http'

export interface JsonAttempt {
  /** Raw assistant text for this attempt (before JSON extraction). */
  raw: string
  /** Tokens billed for this attempt. */
  usage: Usage
}

/**
 * Shared "ask → parse → retry once with the validation error" loop.
 *
 * Both adapters had a byte-for-byte copy of this (~50 lines each, differing only
 * in how one request is built). Keeping one copy means the retry wording, the
 * usage accumulation and the error contract cannot drift apart.
 *
 * Tokens that upstream already billed are attached to the thrown AIError so the
 * usage ledger records the real consumption even when neither attempt parsed.
 */
export async function runJsonRepairLoop<T>(options: {
  schema: z.ZodType<T>
  messages: ChatMessage[]
  /** Performs one request; must throw AIError on transport/parse-shape failures. */
  attempt: (messages: ChatMessage[]) => Promise<JsonAttempt>
}): Promise<GenerateJSONResult<T>> {
  let messages = options.messages
  let usage: Usage = { inputTokens: 0, outputTokens: 0 }

  for (let attemptNo = 1; attemptNo <= 2; attemptNo++) {
    const result = await options.attempt(messages)
    usage = {
      inputTokens: usage.inputTokens + result.usage.inputTokens,
      outputTokens: usage.outputTokens + result.usage.outputTokens,
    }
    try {
      return { data: options.schema.parse(extractJson(result.raw)), usage, attempts: attemptNo }
    } catch (err) {
      if (attemptNo === 2) break
      const detail =
        err instanceof z.ZodError
          ? err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : 'JSON 解析失败'
      messages = [
        ...messages,
        { role: 'assistant', content: result.raw },
        {
          role: 'user',
          content: `上面的输出未通过校验（${detail}）。只输出修正后的 JSON 对象，不要任何解释或代码块。`,
        },
      ]
    }
  }

  const failure = new AIError('PARSE', 'AI 输出两次均未通过 Schema 校验')
  failure.usage = usage
  throw failure
}
