import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { buildDcopilotFile } from '@/services/backup'
import { setSessionKey } from '@/ai/session'

/** §6.3 / §7.2: exports are a strict whitelist — keys and usage data never leave. */
describe('.dcopilot export is secret-free by construction', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('never serialises API Keys, provider configs or AI usage records', async () => {
    setSessionKey('prov-1', 'TEST_KEY_NEVER_EXPORTED_1234567890')
    await db.ai_providers.put({
      id: 'prov-1', label: 'Fake', kind: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1', model: 'fake-model',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    await db.ai_requests.add({
      providerId: 'prov-1', projectId: null, model: 'fake-model', kind: 'text',
      promptId: 'p', promptVersion: '1', inputTokens: 10, outputTokens: 5,
      estimatedUsd: 0.001, status: 'ok', errorCode: null, durationMs: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const file = await buildDcopilotFile('all')
    const json = JSON.stringify(file)
    expect(json).not.toContain('TEST_KEY_NEVER_EXPORTED')
    expect(json).not.toContain('dcopilot.apikey')
    expect(json).not.toContain('ai_providers')
    expect(json).not.toContain('ai_requests')
    expect(json).not.toMatch(/"(?:apiKey|secret|password|token|credential)"/i)
    expect(Object.keys(file).sort()).toEqual(
      ['format', 'formatVersion', 'appVersion', 'exportedAt', 'projects', 'assumptions',
       'experiments', 'ostNodes', 'reports', 'settings'].sort(),
    )
    const settingKeys = Object.keys(file.settings ?? {})
    expect(settingKeys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})
