import { z } from 'zod'
import { db } from '@/db/db'
import { storageEstimate } from '@/db/quota'
import { nowIso } from '@/lib/clock'
import { DCOPILT_FORMAT_VERSION } from './backup'

/**
 * §6.4 本地诊断包（可观测性）：无服务端日志，用户可导出一份脱敏元数据
 * 包用于问题反馈。内容白名单 = 应用/格式版本 + 浏览器环境 + 存储概况 +
 * 最近 50 条 AI 请求元数据（aiRequestSchema 本就不含 Key、Prompt 正文或
 * 任何业务数据）。实现上只读 ai_requests 表——产品六表零接触。
 */

const diagnosticAiRequestSchema = z.object({
  id: z.number().int().optional(),
  providerId: z.string(),
  projectId: z.string().nullable(),
  model: z.string(),
  kind: z.enum(['text', 'json']),
  promptId: z.string(),
  promptVersion: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimatedUsd: z.number().nullable(),
  status: z.enum(['ok', 'error']),
  errorCode: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.string(),
})

export const diagnosticReportSchema = z.object({
  kind: z.literal('discovery-copilot-diagnostics'),
  appVersion: z.string(),
  formatVersion: z.number().int(),
  generatedAt: z.string(),
  userAgent: z.string(),
  language: z.string(),
  storage: z.object({
    usageBytes: z.number().nullable(),
    quotaBytes: z.number().nullable(),
  }),
  aiRequests: z.array(diagnosticAiRequestSchema),
})

export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>

const AI_REQUEST_WINDOW = 50

export async function buildDiagnosticReport(): Promise<DiagnosticReport> {
  const [requests, quota] = await Promise.all([
    db.ai_requests.orderBy('createdAt').reverse().limit(AI_REQUEST_WINDOW).toArray(),
    storageEstimate(),
  ])
  return diagnosticReportSchema.parse({
    kind: 'discovery-copilot-diagnostics',
    appVersion: __APP_VERSION__,
    formatVersion: DCOPILT_FORMAT_VERSION,
    generatedAt: nowIso(),
    userAgent: navigator.userAgent,
    language: navigator.language ?? 'unknown',
    storage: {
      usageBytes: quota.usage,
      quotaBytes: quota.quota,
    },
    aiRequests: requests,
  })
}

export function diagnosticsFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replaceAll('-', '')
  return `diagnostics-${stamp}.json`
}
