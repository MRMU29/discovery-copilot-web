import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '@/db/db'
import { clearProductData } from '@/services/maintenance'

const t = '2026-10-04T00:00:00.000Z'

beforeEach(async () => {
  await resetDb()
})

describe('clearProductData (清除全部产品数据不可恢复)', () => {
  it('clears snapshots and product tables together without touching app state', async () => {
    // 快照存的是全量 .dcopilot；不清会允许用户从 DataBackup 页还原已「清除」的项目。
    await db.snapshots.put({
      id: 'snap-1',
      createdAt: t,
      payload: '{"format":"discovery-copilot","projects":[]}',
      projectCount: 1,
      appVersion: '0.1.0',
    })
    await db.projects.put({
      id: 'p1',
      name: '项目A',
      description: '',
      status: 'active',
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    })
    await db.settings.put({
      key: 'app',
      theme: 'dark',
      language: 'zh-Hans',
      defaultProviderId: null,
      aiMode: 'byok',
      perRequestBudgetUsd: null,
      monthlyBudgetUsd: null,
      updatedAt: t,
    })
    await db.ai_providers.put({
      id: 'prov-1',
      label: 'DeepSeek',
      kind: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      createdAt: t,
    })
    await db.ai_requests.add({
      providerId: 'prov-1',
      projectId: null,
      model: 'deepseek-chat',
      kind: 'json',
      promptId: 'p',
      promptVersion: '1.0.0',
      inputTokens: 1,
      outputTokens: 1,
      estimatedUsd: null,
      status: 'ok',
      errorCode: null,
      durationMs: 5,
      createdAt: t,
    })

    // 前置：五张表都确有数据，避免「本来就是空」造成的假绿。
    expect(await db.snapshots.count()).toBe(1)
    expect(await db.projects.count()).toBe(1)
    expect(await db.settings.count()).toBe(1)
    expect(await db.ai_providers.count()).toBe(1)
    expect(await db.ai_requests.count()).toBe(1)

    await clearProductData()

    // 产品数据 + 快照一并清空
    expect(await db.snapshots.count()).toBe(0)
    expect(await db.projects.count()).toBe(0)
    for (const table of [db.assumptions, db.experiments, db.ost_nodes, db.reports, db.score_events]) {
      expect(await table.count()).toBe(0)
    }
    // 应用设置 / Provider 配置 / 用量账本保留且未被改写
    expect(await db.settings.count()).toBe(1)
    expect(await db.ai_providers.count()).toBe(1)
    expect(await db.ai_requests.count()).toBe(1)
    expect((await db.settings.get('app'))?.aiMode).toBe('byok')
    expect(await db.ai_providers.get('prov-1')).toBeTruthy()
  })
})
