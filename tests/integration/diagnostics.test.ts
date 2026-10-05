import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { buildDiagnosticReport, diagnosticsFileName } from '@/services/diagnostics'

beforeEach(async () => {
  await resetDb()
})

const aiRequestRow = {
  id: 1,
  providerId: 'prov-1',
  projectId: 'proj-1',
  model: 'deepseek-chat',
  kind: 'json' as const,
  promptId: 'identify-assumptions',
  promptVersion: '1.0.0',
  inputTokens: 320,
  outputTokens: 580,
  estimatedUsd: 0.0007,
  status: 'ok' as const,
  errorCode: null,
  durationMs: 1234,
  createdAt: '2026-10-05T00:00:00.000Z',
}

describe('buildDiagnosticReport (§6.4)', () => {
  it('returns env + storage + empty window on a fresh install', async () => {
    const report = await buildDiagnosticReport()
    expect(report.kind).toBe('discovery-copilot-diagnostics')
    expect(report.appVersion.length).toBeGreaterThan(0)
    expect(report.formatVersion).toBe(1)
    expect(report.generatedAt).toBeTruthy()
    expect(typeof report.userAgent).toBe('string')
    expect(report.aiRequests).toEqual([])
  })

  it('includes the latest 50 sanitized AI request rows', async () => {
    await db.ai_requests.bulkPut([
      aiRequestRow,
      { ...aiRequestRow, id: 2, status: 'error' as const, errorCode: 'TIMEOUT', promptId: 'design-experiments' },
    ])
    const report = await buildDiagnosticReport()
    expect(report.aiRequests).toHaveLength(2)
    // 同毫秒写入排序不稳定——按 id 断言
    const byId = new Map(report.aiRequests.map((r) => [r.id, r]))
    expect(byId.get(1)!.status).toBe('ok')
    expect(byId.get(2)!.errorCode).toBe('TIMEOUT')
    // 白名单字段——没有任何 Prompt 正文/业务文本类键
    const keys = Object.keys(report.aiRequests[0]!)
    expect(keys).toEqual(
      expect.arrayContaining(['providerId', 'model', 'promptId', 'promptVersion', 'status', 'errorCode']),
    )
    expect(keys.some((k) => /content|message|text|prompt(?!Id|Version)|statement|body/i.test(k))).toBe(false)
  })

  it('never embeds secrets or product data in the serialized report', async () => {
    await db.ai_requests.bulkPut([aiRequestRow])
    const text = JSON.stringify(await buildDiagnosticReport())
    expect(text).not.toContain('sk-')
    expect(text).not.toContain('api_key')
    // 产品六表零接触：项目名/假设陈述不可能出现
    expect(text).not.toContain('statement')
  })

  it('formats the file name with a date stamp', () => {
    expect(diagnosticsFileName(new Date('2026-10-05T00:00:00Z'))).toBe('diagnostics-20261005.json')
  })
})
