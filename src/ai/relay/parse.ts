import { z } from 'zod'

/**
 * Prompt Relay 容错解析：外部 agent 粘贴回来的内容格式不可控（纯 JSON /
 * markdown 围栏 / 前后解释文字 / 字段大小写与 snake_case / 缺 envelope），
 * 这里统一修复后再过 schema。失败时返回可读的 issues 列表并原样保留粘贴
 * 文本（raw），用户可以直接修改后重新解析——绝不丢弃原文。
 */

export type RelayParseResult<T> = { ok: true; data: T } | { ok: false; issues: string[]; raw: string }

/** "suggested_impact" / "SuggestedImpact" / "suggested impact" → "suggestedImpact". */
function toCamelCase(key: string): string {
  return key
    .replace(/[\s_-]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[toCamelCase(key)] = normalizeKeys(val)
    }
    return out
  }
  return value
}

/** 剥一层 ```json 围栏；围栏外的解释文字由大括号截取兜底。 */
function stripFence(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match ? match[1] : text
}

/**
 * 粘贴的是裸数组而 schema 期望信封对象（{"experiments":[…]}）时，若
 * schema 恰有一个数组字段则自动包一层。
 */
function repairEnvelope<T>(data: unknown, schema: z.ZodType<T>): unknown {
  if (!Array.isArray(data) || !(schema instanceof z.ZodObject)) return data
  const shape = schema.shape as Record<string, z.ZodType>
  const arrayKeys = Object.entries(shape)
    .filter(([, value]) => value instanceof z.ZodArray)
    .map(([key]) => key)
  return arrayKeys.length === 1 ? { [arrayKeys[0]]: data } : data
}

export function parseRelayResult<T>(raw: string, schema: z.ZodType<T>): RelayParseResult<T> {
  if (!raw.trim()) {
    return { ok: false, issues: ['粘贴内容为空。'], raw }
  }

  const candidate = stripFence(raw)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    // 取首个 { 到末个 }：外部 agent 常在 JSON 前后附带解释文字。
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return { ok: false, issues: ['未能在粘贴内容中找到 JSON 对象。'], raw }
    }
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1))
    } catch {
      return { ok: false, issues: ['未能在粘贴内容中找到 JSON 对象。'], raw }
    }
  }

  const result = schema.safeParse(repairEnvelope(normalizeKeys(parsed), schema))
  if (result.success) {
    return { ok: true, data: result.data }
  }
  const issues = result.error.issues.map((issue) => `字段 ${issue.path.join('.') || '(根)'}：${issue.message}`)
  return { ok: false, issues, raw }
}
